/*
 * ServiceCall Local Recording Service
 *
 * V1 proof:
 * Mix the local Agora microphone and all
 * subscribed remote Agora audio tracks into
 * one MediaRecorder recording.
 *
 * Final MP3 conversion comes after we prove
 * that the mixed recording contains both sides.
 */


let audioContext = null;
let destination = null;

let mediaRecorder = null;

let recordedChunks = [];

let localSource = null;

const remoteSources =
    new Map();

let recording =
    false;

let remoteSyncTimer =
    null;


/* -------------------------------------------------------
   GET NATIVE MEDIASTREAMTRACK
------------------------------------------------------- */

function getNativeAudioTrack(
    agoraTrack
) {

    if (!agoraTrack) {
        return null;
    }


    /*
     * Agora local and remote audio tracks expose
     * their underlying browser MediaStreamTrack.
     */
    if (
        typeof agoraTrack.getMediaStreamTrack ===
        'function'
    ) {

        return agoraTrack
            .getMediaStreamTrack();
    }


    return null;
}


/* -------------------------------------------------------
   CONNECT ONE TRACK TO MIXER
------------------------------------------------------- */

function connectTrack(
    agoraTrack
) {

    const nativeTrack =
        getNativeAudioTrack(
            agoraTrack
        );


    if (!nativeTrack) {

        throw new Error(
            'Unable to access an Agora audio MediaStreamTrack.'
        );
    }


    const stream =
        new MediaStream([
            nativeTrack
        ]);


    const source =
        audioContext
            .createMediaStreamSource(
                stream
            );


    source.connect(
        destination
    );


    return source;
}


/* -------------------------------------------------------
   SYNC REMOTE PARTICIPANTS
------------------------------------------------------- */

function syncRemoteTracks() {

    if (
        !recording ||
        !window.ServiceCallAgora
    ) {
        return;
    }


    const remoteTracks =
        window.ServiceCallAgora
            .getRemoteAudioTracks();


    const activeTracks =
        new Set();


    remoteTracks.forEach(
        (
            agoraTrack,
            index
        ) => {

            const nativeTrack =
                getNativeAudioTrack(
                    agoraTrack
                );


            if (!nativeTrack) {
                return;
            }


            /*
             * MediaStreamTrack.id gives us a stable
             * identifier while that remote audio
             * track remains active.
             */
            const trackId =
                nativeTrack.id ||
                String(index);


            activeTracks.add(
                trackId
            );


            /*
             * Participant already connected to
             * our recording mixer.
             */
            if (
                remoteSources.has(
                    trackId
                )
            ) {
                return;
            }


            try {

                const source =
                    connectTrack(
                        agoraTrack
                    );


                remoteSources.set(
                    trackId,
                    source
                );


                console.log(
                    'ServiceCall recorder added remote audio track:',
                    trackId
                );


            } catch (error) {

                console.error(
                    'Unable to add remote participant to recording:',
                    error
                );
            }
        }
    );


    /*
     * Remove tracks belonging to users who
     * left/unpublished while recording.
     */
    for (
        const [
            trackId,
            source
        ] of remoteSources
    ) {

        if (
            activeTracks.has(
                trackId
            )
        ) {
            continue;
        }


        try {

            source.disconnect();

        } catch (error) {
            // Already disconnected.
        }


        remoteSources.delete(
            trackId
        );


        console.log(
            'ServiceCall recorder removed remote audio track:',
            trackId
        );
    }
}


/* -------------------------------------------------------
   START RECORDING
------------------------------------------------------- */

async function startRecording() {

    if (recording) {

        return {
            success: false,
            message:
                'Recording is already active.'
        };
    }


    if (
        !window.ServiceCallAgora ||
        !window.ServiceCallAgora.isJoined()
    ) {

        throw new Error(
            'ServiceCall audio must be connected before recording.'
        );
    }


    const localAgoraTrack =
        window.ServiceCallAgora
            .getLocalAudioTrack();


    if (!localAgoraTrack) {

        throw new Error(
            'Local ServiceCall microphone track is unavailable.'
        );
    }


    audioContext =
        new (
            window.AudioContext ||
            window.webkitAudioContext
        )();


    if (
        audioContext.state ===
        'suspended'
    ) {

        await audioContext.resume();
    }


    destination =
        audioContext
            .createMediaStreamDestination();


    /*
     * Add local microphone.
     */
    localSource =
        connectTrack(
            localAgoraTrack
        );


    /*
     * Recording is marked active before remote
     * sync so syncRemoteTracks() can proceed.
     */
    recording =
        true;


    /*
     * Add everyone currently subscribed.
     */
    syncRemoteTracks();


    recordedChunks =
        [];


    /*
     * Chromium/Electron normally supports
     * WebM + Opus for audio recording.
     */
    const preferredMimeType =
        'audio/webm;codecs=opus';


    const mimeType =
        MediaRecorder.isTypeSupported(
            preferredMimeType
        )
            ? preferredMimeType
            : 'audio/webm';


    mediaRecorder =
        new MediaRecorder(
            destination.stream,
            {
                mimeType: mimeType,
                audioBitsPerSecond:
                    128000
            }
        );


    mediaRecorder.addEventListener(
        'dataavailable',
        (event) => {

            if (
                event.data &&
                event.data.size > 0
            ) {

                recordedChunks.push(
                    event.data
                );
            }
        }
    );


    mediaRecorder.start(
        1000
    );


    /*
     * Conference participants can join/leave
     * during recording. Periodically synchronize
     * Agora's current remote audio tracks with
     * our recording mixer.
     */
    remoteSyncTimer =
        setInterval(
            syncRemoteTracks,
            1000
        );


    console.log(
        'ServiceCall mixed audio recording started.'
    );


    return {
        success: true,
        mimeType: mimeType
    };
}


/* -------------------------------------------------------
   CLEAN UP MIXER
------------------------------------------------------- */

async function cleanupMixer() {

    if (remoteSyncTimer) {

        clearInterval(
            remoteSyncTimer
        );

        remoteSyncTimer =
            null;
    }


    if (localSource) {

        try {

            localSource.disconnect();

        } catch (error) {
            // Already disconnected.
        }


        localSource =
            null;
    }


    for (
        const source
        of remoteSources.values()
    ) {

        try {

            source.disconnect();

        } catch (error) {
            // Already disconnected.
        }
    }


    remoteSources.clear();


    destination =
        null;


    if (audioContext) {

        try {

            await audioContext.close();

        } catch (error) {
            // Ignore AudioContext close errors.
        }


        audioContext =
            null;
    }
}


/* -------------------------------------------------------
   STOP RECORDING
------------------------------------------------------- */

async function stopRecording() {

    if (
        !recording ||
        !mediaRecorder
    ) {

        return {
            success: false,
            message:
                'Recording is not active.'
        };
    }


    return new Promise(
        (
            resolve,
            reject
        ) => {

            mediaRecorder.addEventListener(
                'stop',

                async () => {

                    try {

                        const mimeType =
                            mediaRecorder.mimeType ||
                            'audio/webm';


                        const blob =
                            new Blob(
                                recordedChunks,
                                {
                                    type:
                                        mimeType
                                }
                            );


                        mediaRecorder =
                            null;

                        recordedChunks =
                            [];

                        recording =
                            false;


                        await cleanupMixer();


                        console.log(
                            'ServiceCall mixed audio recording stopped.',
                            'Size:',
                            blob.size
                        );


                        resolve({
                            success: true,
                            blob: blob,
                            mimeType:
                                mimeType,
                            size:
                                blob.size
                        });


                    } catch (error) {

                        recording =
                            false;

                        await cleanupMixer();

                        reject(
                            error
                        );
                    }
                },
                {
                    once: true
                }
            );


            try {

                mediaRecorder.stop();

            } catch (error) {

                recording =
                    false;

                cleanupMixer();

                reject(
                    error
                );
            }
        }
    );
}


/* -------------------------------------------------------
   STATUS
------------------------------------------------------- */

function isRecording() {

    return recording;
}


/* -------------------------------------------------------
   PUBLIC API
------------------------------------------------------- */

window.ServiceCallRecorder = {

    start:
        startRecording,

    stop:
        stopRecording,

    isRecording:
        isRecording
};