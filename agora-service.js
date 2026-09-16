const AgoraRTC =
    require('agora-rtc-sdk-ng');


let client = null;
let localAudioTrack = null;
let joined = false;
let muted = false;

let tokenRenewalHandler = null;
let tokenRenewalInProgress = false;


/*
 * Remote Agora audio tracks currently
 * subscribed in this call.
 *
 * Key   = Agora UID
 * Value = Agora remote audio track
 *
 * Later our ServiceCall recorder will use
 * these tracks together with the local
 * microphone to create one recording.
 */
const remoteAudioTracks =
    new Map();


/* -------------------------------------------------------
   CREATE CLIENT
------------------------------------------------------- */

function createClient() {

    if (client) {
        return client;
    }


    client =
        AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8'
        });


    /*
     * Another participant publishes media.
     */
    client.on(
        'user-published',

        async (
            user,
            mediaType
        ) => {

            try {

                await client.subscribe(
                    user,
                    mediaType
                );


                console.log(
                    'ServiceCall subscribed to remote user:',
                    user.uid,
                    mediaType
                );


                if (
                    mediaType ===
                    'audio'
                ) {

                    /*
                     * Keep a reference to the
                     * subscribed remote audio track.
                     *
                     * Normal playback continues exactly
                     * as before.
                     */
                    remoteAudioTracks.set(
                        String(user.uid),
                        user.audioTrack
                    );


                    user.audioTrack.play();


                    console.log(
                        'ServiceCall remote audio playing:',
                        user.uid
                    );


                    console.log(
                        'ServiceCall remote audio tracks available:',
                        remoteAudioTracks.size
                    );
                }


            } catch (error) {

                console.error(
                    'Unable to subscribe to remote ServiceCall user:',
                    error
                );
            }
        }
    );


    /*
     * Remote participant stops publishing media.
     */
    client.on(
        'user-unpublished',

        (
            user,
            mediaType
        ) => {

            if (
                mediaType ===
                'audio'
            ) {

                remoteAudioTracks.delete(
                    String(user.uid)
                );


                console.log(
                    'ServiceCall remote audio track removed:',
                    user.uid
                );
            }


            console.log(
                'ServiceCall remote user unpublished:',
                user.uid,
                mediaType
            );
        }
    );


    /*
     * Remote participant leaves Agora.
     */
    client.on(
        'user-left',

        (user) => {

            remoteAudioTracks.delete(
                String(user.uid)
            );


            console.log(
                'ServiceCall remote user left:',
                user.uid
            );


            console.log(
                'ServiceCall remote audio tracks available:',
                remoteAudioTracks.size
            );
        }
    );


    /*
     * Agora warns us shortly before the
     * current RTC token expires.
     *
     * We ask call-window.js for fresh
     * media credentials and renew the
     * Agora token without leaving the call.
     */
    client.on(
        'token-privilege-will-expire',

        async () => {

            console.log(
                'ServiceCall Agora token will expire soon.'
            );


            if (
                tokenRenewalInProgress
            ) {

                console.log(
                    'ServiceCall token renewal is already in progress.'
                );

                return;
            }


            if (
                typeof tokenRenewalHandler !==
                'function'
            ) {

                console.error(
                    'ServiceCall token renewal handler is unavailable.'
                );

                return;
            }


            tokenRenewalInProgress =
                true;


            try {

                const newToken =
                    await tokenRenewalHandler();


                if (!newToken) {

                    throw new Error(
                        'A renewed Agora token was not returned.'
                    );
                }


                /*
                 * Never log newToken.
                 */
                await client.renewToken(
                    newToken
                );


                console.log(
                    'ServiceCall Agora token renewed successfully.'
                );


            } catch (error) {

                console.error(
                    'ServiceCall Agora token renewal failed:',
                    error
                );


            } finally {

                tokenRenewalInProgress =
                    false;
            }
        }
    );


    /*
     * This event means the token actually
     * expired before we successfully renewed it.
     *
     * Do not automatically leave the call here.
     * Log the condition so we can diagnose it.
     */
    client.on(
        'token-privilege-did-expire',

        () => {

            console.error(
                'ServiceCall Agora token expired before renewal completed.'
            );
        }
    );


    return client;
}


/* -------------------------------------------------------
   JOIN AUDIO CALL
------------------------------------------------------- */

async function joinAudioCall(
    config
) {

    if (joined) {

        console.log(
            'ServiceCall is already connected to Agora.'
        );


        return {
            success: true
        };
    }


    if (
        !config ||
        !config.appId ||
        !config.channel ||
        !config.token ||
        !config.uid
    ) {

        throw new Error(
            'Agora media credentials are incomplete.'
        );
    }


    /*
     * Save the callback supplied by
     * call-window.js.
     *
     * When Agora warns that the current
     * token is expiring, this callback
     * obtains another token from ServiceNow.
     */
    tokenRenewalHandler =
        typeof config.renewToken ===
        'function'
            ? config.renewToken
            : null;


    const numericUid =
        Number(
            config.uid
        );


    if (
        !Number.isInteger(
            numericUid
        ) ||
        numericUid <= 0 ||
        numericUid > 4294967295
    ) {

        throw new Error(
            'Agora participant UID is invalid.'
        );
    }


    try {

        const rtcClient =
            createClient();


        /*
         * IMPORTANT:
         *
         * The token generated by our server is
         * bound to this exact numeric UID.
         *
         * Therefore we must NOT use null here.
         */
        const joinedUid =
            await rtcClient.join(
                config.appId,
                config.channel,
                config.token,
                numericUid
            );


        console.log(
            'ServiceCall joined Agora channel:',
            config.channel,
            'UID:',
            joinedUid
        );


        /*
         * Create the microphone track with
         * built-in audio processing.
         *
         * AEC = Acoustic Echo Cancellation
         * ANS = Automatic Noise Suppression
         * AGC = Automatic Gain Control
         */
        localAudioTrack =
            await AgoraRTC
                .createMicrophoneAudioTrack({
                    AEC: true,
                    ANS: true,
                    AGC: true
                });


        /*
         * Publish microphone into the channel.
         */
        await rtcClient.publish(
            [
                localAudioTrack
            ]
        );


        joined =
            true;

        muted =
            false;


        console.log(
            'ServiceCall microphone published successfully.'
        );


        return {
            success: true,
            uid: joinedUid
        };


    } catch (error) {

        console.error(
            'Unable to join ServiceCall audio:',
            error
        );


        /*
         * Clean up a partially established
         * connection if anything failed.
         */
        await leaveAudioCall();


        throw error;
    }
}


/* -------------------------------------------------------
   MUTE / UNMUTE
------------------------------------------------------- */

async function setMuted(
    shouldMute
) {

    if (!localAudioTrack) {

        throw new Error(
            'ServiceCall microphone is not active.'
        );
    }


    await localAudioTrack.setMuted(
        shouldMute
    );


    muted =
        shouldMute;


    return {
        success: true,
        muted: muted
    };
}


/* -------------------------------------------------------
   RECORDING TRACK ACCESS
------------------------------------------------------- */

/*
 * These methods DO NOT start recording.
 *
 * They only give the future ServiceCall
 * recorder access to the active Agora tracks.
 */

function getLocalAudioTrack() {

    return localAudioTrack;
}


function getRemoteAudioTracks() {

    return Array.from(
        remoteAudioTracks.values()
    );
}


function getRemoteAudioTrackCount() {

    return remoteAudioTracks.size;
}


/* -------------------------------------------------------
   LEAVE AUDIO CALL
------------------------------------------------------- */

async function leaveAudioCall() {

    try {

        if (localAudioTrack) {

            try {

                localAudioTrack.stop();

            } catch (error) {
                // Ignore track stop error.
            }


            try {

                localAudioTrack.close();

            } catch (error) {
                // Ignore track close error.
            }


            localAudioTrack =
                null;
        }


        if (client) {

            try {

                await client.leave();

            } catch (error) {

                console.error(
                    'Agora leave failed:',
                    error
                );
            }
        }


    } finally {

        /*
         * Remove all references to remote
         * participant audio when this
         * desktop leaves the Agora channel.
         */
        remoteAudioTracks.clear();


        client =
            null;

        joined =
            false;

        muted =
            false;

        tokenRenewalHandler =
            null;

        tokenRenewalInProgress =
            false;


        console.log(
            'ServiceCall left Agora audio.'
        );
    }


    return {
        success: true
    };
}


/* -------------------------------------------------------
   STATUS
------------------------------------------------------- */

function isJoined() {

    return joined;
}


function isMuted() {

    return muted;
}


/* -------------------------------------------------------
   PUBLIC SERVICECALL MEDIA API
------------------------------------------------------- */

window.ServiceCallAgora = {

    join:
        joinAudioCall,

    leave:
        leaveAudioCall,

    setMuted:
        setMuted,

    isJoined:
        isJoined,

    isMuted:
        isMuted,


    /*
     * Recording support.
     *
     * These expose only the active media
     * track objects to our local recorder.
     * They do not expose Agora credentials.
     */
    getLocalAudioTrack:
        getLocalAudioTrack,

    getRemoteAudioTracks:
        getRemoteAudioTracks,

    getRemoteAudioTrackCount:
        getRemoteAudioTrackCount
};