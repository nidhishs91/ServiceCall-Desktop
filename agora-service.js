/*
 * ServiceCall Agora Media Service
 *
 * Handles:
 * - Agora RTC connection
 * - Microphone audio
 * - Remote conference audio
 * - Screen-share video publication
 * - Remote screen-share video
 * - Token renewal
 * - Recording track access
 */

const AgoraRTC =
    require('agora-rtc-sdk-ng');


let client = null;

let localAudioTrack = null;

/*
 * Local screen track while THIS participant
 * is sharing their screen.
 */
let localScreenVideoTrack = null;


let joined = false;
let muted = false;
let screenSharing = false;

let tokenRenewalHandler = null;
let tokenRenewalInProgress = false;


/*
 * Remote Agora audio tracks.
 *
 * Key   = Agora UID
 * Value = Agora remote audio track
 */
const remoteAudioTracks =
    new Map();


/*
 * Remote Agora video tracks.
 *
 * For V1, ServiceCall does not publish camera
 * video. Therefore remote video represents
 * screen sharing.
 *
 * Key   = Agora UID
 * Value = Agora remote video track
 */
const remoteScreenVideoTracks =
    new Map();


/*
 * Callback supplied by call-window.js.
 *
 * This allows the UI to react when another
 * participant starts/stops screen sharing.
 */
let remoteScreenHandler = null;


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


                /* --------------------------------
                   REMOTE AUDIO
                -------------------------------- */

                if (
                    mediaType ===
                    'audio'
                ) {

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


                /* --------------------------------
                   REMOTE SCREEN VIDEO
                -------------------------------- */

                if (
                    mediaType ===
                    'video'
                ) {

                    if (!user.videoTrack) {

                        console.error(
                            'ServiceCall remote video track is unavailable:',
                            user.uid
                        );

                        return;
                    }


                    remoteScreenVideoTracks.set(
                        String(user.uid),
                        user.videoTrack
                    );


                    console.log(
                        'ServiceCall remote screen track received:',
                        user.uid
                    );


                    /*
                     * Tell call-window.js that a
                     * participant is sharing video.
                     *
                     * call-window.js decides where
                     * the track is rendered.
                     */
                    if (
                        typeof remoteScreenHandler ===
                        'function'
                    ) {

                        remoteScreenHandler({
                            action:
                                'started',

                            uid:
                                String(
                                    user.uid
                                ),

                            track:
                                user.videoTrack
                        });
                    }
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

            /* --------------------------------
               AUDIO
            -------------------------------- */

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


            /* --------------------------------
               SCREEN VIDEO
            -------------------------------- */

            if (
                mediaType ===
                'video'
            ) {

                const uid =
                    String(
                        user.uid
                    );


                const remoteTrack =
                    remoteScreenVideoTracks
                        .get(
                            uid
                        );


                if (remoteTrack) {

                    try {

                        remoteTrack.stop();

                    } catch (error) {
                        // Ignore playback stop error.
                    }
                }


                remoteScreenVideoTracks.delete(
                    uid
                );


                console.log(
                    'ServiceCall remote screen track removed:',
                    user.uid
                );


                if (
                    typeof remoteScreenHandler ===
                    'function'
                ) {

                    remoteScreenHandler({
                        action:
                            'stopped',

                        uid:
                            uid
                    });
                }
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

            const uid =
                String(
                    user.uid
                );


            remoteAudioTracks.delete(
                uid
            );


            const remoteVideoTrack =
                remoteScreenVideoTracks
                    .get(
                        uid
                    );


            if (remoteVideoTrack) {

                try {

                    remoteVideoTrack.stop();

                } catch (error) {
                    // Ignore playback stop error.
                }
            }


            remoteScreenVideoTracks.delete(
                uid
            );


            if (
                typeof remoteScreenHandler ===
                'function'
            ) {

                remoteScreenHandler({
                    action:
                        'stopped',

                    uid:
                        uid
                });
            }


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
     * Agora warns shortly before the
     * current RTC token expires.
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
                 * NEVER log newToken.
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


        localAudioTrack =
            await AgoraRTC
                .createMicrophoneAudioTrack({
                    AEC: true,
                    ANS: true,
                    AGC: true
                });


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
   START SCREEN SHARE
------------------------------------------------------- */

/*
 * screenTrack must be an Agora-compatible
 * local video track created from the
 * Electron-selected desktop source.
 *
 * Electron source selection will be wired
 * in the next step.
 */
async function startScreenShare(
    screenTrack
) {

    if (
        !joined ||
        !client
    ) {

        throw new Error(
            'ServiceCall must be connected before sharing a screen.'
        );
    }


    if (screenSharing) {

        return {
            success: true,
            alreadySharing: true
        };
    }


    if (!screenTrack) {

        throw new Error(
            'A screen video track was not provided.'
        );
    }


    try {

        localScreenVideoTrack =
            screenTrack;


        await client.publish(
            [
                localScreenVideoTrack
            ]
        );


        screenSharing =
            true;


        console.log(
            'ServiceCall screen published successfully.'
        );


        return {
            success: true
        };


    } catch (error) {

        localScreenVideoTrack =
            null;

        screenSharing =
            false;


        console.error(
            'Unable to publish ServiceCall screen:',
            error
        );


        throw error;
    }
}


/* -------------------------------------------------------
   STOP SCREEN SHARE
------------------------------------------------------- */

async function stopScreenShare() {

    const track =
        localScreenVideoTrack;


    if (!track) {

        screenSharing =
            false;


        return {
            success: true
        };
    }


    try {

        if (client) {

            try {

                await client.unpublish(
                    [
                        track
                    ]
                );

            } catch (error) {

                console.error(
                    'Unable to unpublish ServiceCall screen:',
                    error
                );
            }
        }


        try {

            track.stop();

        } catch (error) {
            // Ignore track stop error.
        }


        try {

            track.close();

        } catch (error) {
            // Ignore track close error.
        }


    } finally {

        localScreenVideoTrack =
            null;

        screenSharing =
            false;


        console.log(
            'ServiceCall screen sharing stopped.'
        );
    }


    return {
        success: true
    };
}


/* -------------------------------------------------------
   REMOTE SCREEN EVENT HANDLER
------------------------------------------------------- */

function setRemoteScreenHandler(
    handler
) {

    remoteScreenHandler =
        typeof handler ===
        'function'
            ? handler
            : null;
}


/* -------------------------------------------------------
   RECORDING TRACK ACCESS
------------------------------------------------------- */

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


/*
 * Later recording-service.js will use
 * this track when producing MP4.
 */
function getLocalScreenVideoTrack() {

    return localScreenVideoTrack;
}


function getRemoteScreenVideoTracks() {

    return Array.from(
        remoteScreenVideoTracks.values()
    );
}


/* -------------------------------------------------------
   LEAVE AUDIO CALL
------------------------------------------------------- */

async function leaveAudioCall() {

    try {

        /*
         * Stop screen sharing first so the
         * video publication is cleaned up.
         */
        if (localScreenVideoTrack) {

            await stopScreenShare();
        }


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


        /*
         * Stop remote video playback before
         * clearing our references.
         */
        remoteScreenVideoTracks
            .forEach(
                (track) => {

                    try {

                        track.stop();

                    } catch (error) {
                        // Ignore playback stop error.
                    }
                }
            );


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

        remoteAudioTracks.clear();

        remoteScreenVideoTracks.clear();


        client =
            null;

        localAudioTrack =
            null;

        localScreenVideoTrack =
            null;


        joined =
            false;

        muted =
            false;

        screenSharing =
            false;


        tokenRenewalHandler =
            null;

        tokenRenewalInProgress =
            false;

        remoteScreenHandler =
            null;


        console.log(
            'ServiceCall left Agora media.'
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


function isScreenSharing() {

    return screenSharing;
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


    /* -------------------------
       SCREEN SHARING
    ------------------------- */

    createScreenVideoTrack:
        createScreenVideoTrack,

    startScreenShare:
        startScreenShare,

    stopScreenShare:
        stopScreenShare,

    isScreenSharing:
        isScreenSharing,

    setRemoteScreenHandler:
        setRemoteScreenHandler,


    /* -------------------------
       RECORDING SUPPORT
    ------------------------- */

    getLocalAudioTrack:
        getLocalAudioTrack,

    getRemoteAudioTracks:
        getRemoteAudioTracks,

    getRemoteAudioTrackCount:
        getRemoteAudioTrackCount,

    getLocalScreenVideoTrack:
        getLocalScreenVideoTrack,

    getRemoteScreenVideoTracks:
        getRemoteScreenVideoTracks
};

async function createScreenVideoTrack(
    mediaStreamTrack
) {

    if (!mediaStreamTrack) {

        throw new Error(
            'Screen MediaStreamTrack was not provided.'
        );
    }


    const agoraTrack =
        AgoraRTC.createCustomVideoTrack({
            mediaStreamTrack:
                mediaStreamTrack
        });


    return agoraTrack;
}