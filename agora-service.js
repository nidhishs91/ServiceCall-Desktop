const AgoraRTC =
    require('agora-rtc-sdk-ng');


let client = null;
let localAudioTrack = null;
let joined = false;
let muted = false;


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
     * Another participant publishes audio.
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

                    user.audioTrack.play();


                    console.log(
                        'ServiceCall remote audio playing:',
                        user.uid
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
     * Remote participant stops publishing.
     */
    client.on(
        'user-unpublished',

        (
            user,
            mediaType
        ) => {

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

            console.log(
                'ServiceCall remote user left:',
                user.uid
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
        !config.channel
    ) {

        throw new Error(
            'Agora configuration is incomplete.'
        );
    }


    try {

        const rtcClient =
            createClient();


        /*
         * null UID tells Agora to assign
         * a unique numeric UID automatically.
         */
        const uid =
            await rtcClient.join(
                config.appId,
                config.channel,
                config.token || null,
                null
            );


        console.log(
            'ServiceCall joined Agora channel:',
            config.channel,
            'UID:',
            uid
        );


        /*
         * Ask Windows/browser for microphone
         * permission and create microphone track.
         */
        localAudioTrack =
            await AgoraRTC
                .createMicrophoneAudioTrack();


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
            uid: uid
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

        client =
            null;

        joined =
            false;

        muted =
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
        isMuted
};