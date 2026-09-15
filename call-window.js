const params =
    new URLSearchParams(
        window.location.search
    );
    
const mode =
    params.get('mode') ||
    'incoming';

const callSysId =
    params.get('callSysId') ||
    '';

const personName =
    params.get('name') ||
    'Unknown User';

const department =
    params.get('department') ||
    '';

const callNumber =
    params.get('callNumber') ||
    '';


let currentMode =
    mode;

let callStatusTimer =
    null;

let callStartedAt =
    null;

let durationTimer =
    null;

let closeTimer = null;

let ringtoneInterval = null;
let audioContext = null;

/* -------------------------
   ELEMENTS
------------------------- */

const avatar =
    document.getElementById(
        'avatar'
    );

const personNameElement =
    document.getElementById(
        'personName'
    );

const departmentElement =
    document.getElementById(
        'department'
    );

const statusText =
    document.getElementById(
        'statusText'
    );

const callNumberElement =
    document.getElementById(
        'callNumber'
    );

const timerElement =
    document.getElementById(
        'timer'
    );

const incomingActions =
    document.getElementById(
        'incomingActions'
    );

const callingActions =
    document.getElementById(
        'callingActions'
    );

const connectedActions =
    document.getElementById(
        'connectedActions'
    );


/* -------------------------
   INITIAL DISPLAY
------------------------- */

personNameElement.textContent =
    personName;

departmentElement.textContent =
    department;

callNumberElement.textContent =
    callNumber;


const initials =
    personName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(
            part =>
                part[0]
                    .toUpperCase()
        )
        .join('');


avatar.textContent =
    initials || '?';

/* -------------------------
   RINGTONE
------------------------- */
 
function playRingTone(
    frequency = 440
) {
 
    try {
 
        if (!audioContext) {
 
            audioContext =
                new (
                    window.AudioContext ||
                    window.webkitAudioContext
                )();
        }
 
 
        const oscillator =
            audioContext.createOscillator();
 
        const gain =
            audioContext.createGain();
 
 
        oscillator.type =
            'sine';
 
        oscillator.frequency.value =
            frequency;
 
 
        gain.gain.value =
            0.08;
 
 
        oscillator.connect(
            gain
        );
 
        gain.connect(
            audioContext.destination
        );
 
 
        oscillator.start();
 
 
        setTimeout(
            () => {
 
                try {
 
                    oscillator.stop();
 
                } catch (error) {
                    // Already stopped.
                }
 
            },
            500
        );
 
    } catch (error) {
 
        console.error(
            'Unable to play ServiceCall ringtone:',
            error
        );
    }
}
 
 
function startRingtone(
    type
) {
 
    stopRingtone();
 
 
    /*
     * Incoming call:
     * slightly higher tone.
     *
     * Outgoing call:
     * lower ringback tone.
     */
    const frequency =
        type === 'incoming'
            ? 520
            : 420;
 
 
    playRingTone(
        frequency
    );
 
 
    ringtoneInterval =
        setInterval(
            () => {
 
                playRingTone(
                    frequency
                );
 
            },
            1800
        );
}
 
 
function stopRingtone() {
 
    if (ringtoneInterval) {
 
        clearInterval(
            ringtoneInterval
        );
 
        ringtoneInterval =
            null;
    }
}

/* -------------------------
   AGORA AUDIO
------------------------- */

let agoraJoining = false;


async function startAgoraAudio() {

    if (
        !window.ServiceCallAgora
    ) {

        console.error(
            'ServiceCall Agora media service is not available.'
        );

        statusText.textContent =
            'Audio service unavailable';

        return;
    }


    if (
        window.ServiceCallAgora.isJoined() ||
        agoraJoining
    ) {
        return;
    }


    agoraJoining =
        true;


    try {

        console.log(
            'ServiceCall preparing Agora audio...'
        );


        const config =
            await window.serviceCall
                .getAgoraConfig();


        if (
            !config ||
            !config.success
        ) {

            throw new Error(
                config &&
                config.message
                    ? config.message
                    : 'Agora configuration could not be loaded.'
            );
        }


        console.log(
            'ServiceCall joining Agora audio channel...'
        );


        await window.ServiceCallAgora.join({
            appId:
                config.appId,

            token:
                config.token,

            channel:
                config.channel
        });


        console.log(
            'ServiceCall audio connected successfully.'
        );


    } catch (error) {

        console.error(
            'ServiceCall audio connection failed:',
            error
        );


        statusText.textContent =
            'Connected - audio unavailable';


    } finally {

        agoraJoining =
            false;
    }
}


async function stopAgoraAudio() {

    if (
        !window.ServiceCallAgora
    ) {
        return;
    }


    try {

        await window.ServiceCallAgora
            .leave();

    } catch (error) {

        console.error(
            'Unable to leave ServiceCall audio:',
            error
        );
    }
}

/* -------------------------
   UI STATE
------------------------- */

function setMode(
    newMode
) {

    currentMode =
        newMode;


    incomingActions
        .classList
        .add('hidden');

    callingActions
        .classList
        .add('hidden');

    connectedActions
        .classList
        .add('hidden');

    timerElement
        .classList
        .add('hidden');


    if (
        newMode ===
        'incoming'
    ) {

        statusText.textContent =
            'is calling you...';

        incomingActions
            .classList
            .remove('hidden');


        startRingtone('incoming');
        return;
    }


    if (
        newMode ===
        'calling'
    ) {

        statusText.textContent =
            'Ringing';

        callingActions
            .classList
            .remove('hidden');

        startRingtone('outgoing');

        return;
    }


    if (
        newMode ===
        'connected'
    ) {

        stopRingtone();

        statusText.textContent =
            'Connected';

        connectedActions
            .classList
            .remove('hidden');

        timerElement
            .classList
            .remove('hidden');

        startDurationTimer();

        startAgoraAudio();

        return;
    }


    if (
    newMode ===
    'declined'
) {

    stopRingtone();
 
    statusText.textContent =
        'Call declined';
 
    stopAllTimers();
 
    closeCallWindowAfterDelay();
 
    return;
}


    if (
    newMode ===
    'cancelled'
) {

    stopRingtone();
 
    statusText.textContent =
        'Call cancelled';
 
    stopAllTimers();
 
    closeCallWindowAfterDelay();
 
    return;
}


    if (
    newMode ===
    'completed'
) {

    stopRingtone();

    statusText.textContent =
        'Call ended';

    stopAllTimers();

    stopAgoraAudio();

    closeCallWindowAfterDelay();

    return;
}
}


/* -------------------------
   CALL TIMER
------------------------- */

function startDurationTimer() {

    if (durationTimer) {
        return;
    }


    callStartedAt =
        Date.now();


    durationTimer =
        setInterval(
            () => {

                const seconds =
                    Math.floor(
                        (
                            Date.now() -
                            callStartedAt
                        ) / 1000
                    );


                const minutes =
                    Math.floor(
                        seconds / 60
                    );


                const remainingSeconds =
                    seconds % 60;


                timerElement.textContent =
                    String(minutes)
                        .padStart(
                            2,
                            '0'
                        ) +
                    ':' +
                    String(
                        remainingSeconds
                    )
                        .padStart(
                            2,
                            '0'
                        );

            },
            1000
        );
}


/* -------------------------
   STATUS POLLING
------------------------- */

async function checkCallStatus() {

    if (!callSysId) {
        return;
    }


    try {

        const result =
            await window.serviceCall
                .getCallStatus(
                    callSysId
                );


        if (
            !result ||
            !result.success
        ) {
            return;
        }


        const state =
            result.state;


        if (
            state === 'connected' &&
            currentMode !==
                'connected'
        ) {

            setMode(
                'connected'
            );

            return;
        }


        if (
            state === 'declined'
        ) {

            setMode(
                'declined'
            );

            return;
        }


        if (
            state === 'cancelled'
        ) {

            setMode(
                'cancelled'
            );

            return;
        }


        if (
            state === 'completed'
        ) {

            setMode(
                'completed'
            );

            return;
        }

    } catch (error) {

        console.error(
            'Call status error:',
            error
        );
    }
}


function startCallStatusPolling() {

    if (!callSysId) {
        return;
    }


    checkCallStatus();


    callStatusTimer =
        setInterval(
            checkCallStatus,
            2000
        );
}


/* -------------------------
   ACCEPT
------------------------- */

document
    .getElementById(
        'acceptButton'
    )
    .addEventListener(
        'click',
        async () => {

            try {

                const result =
                    await window
                        .serviceCall
                        .acceptCall(
                            callSysId
                        );


                if (
                    result.success
                ) {

                    setMode(
                        'connected'
                    );
                }

            } catch (error) {

                console.error(
                    'Accept call failed:',
                    error
                );

                statusText.textContent =
                    error.message ||
                    'Unable to accept call.';
            }
        }
    );


/* -------------------------
   DECLINE
------------------------- */

document
    .getElementById(
        'declineButton'
    )
    .addEventListener(
        'click',
        async () => {

            try {

                const result =
                    await window
                        .serviceCall
                        .declineCall(
                            callSysId
                        );


                if (
                    result.success
                ) {

                    setMode(
                        'declined'
                    );
                }

            } catch (error) {

                console.error(
                    'Decline call failed:',
                    error
                );

                statusText.textContent =
                    error.message ||
                    'Unable to decline call.';
            }
        }
    );


/* -------------------------
   CANCEL
------------------------- */

document
    .getElementById(
        'cancelButton'
    )
    .addEventListener(
        'click',
        async () => {

            try {

                const result =
                    await window
                        .serviceCall
                        .cancelCall(
                            callSysId
                        );


                if (
                    result.success
                ) {

                    setMode(
                        'cancelled'
                    );
                }

            } catch (error) {

                console.error(
                    'Cancel call failed:',
                    error
                );

                statusText.textContent =
                    error.message ||
                    'Unable to cancel call.';
            }
        }
    );

/* -------------------------
   MUTE / UNMUTE
------------------------- */

document
    .getElementById(
        'muteButton'
    )
    .addEventListener(
        'click',
        async () => {

            try {

                if (
                    !window.ServiceCallAgora ||
                    !window.ServiceCallAgora.isJoined()
                ) {

                    statusText.textContent =
                        'Audio is not connected';

                    return;
                }


                const currentlyMuted =
                    window.ServiceCallAgora
                        .isMuted();


                const result =
                    await window.ServiceCallAgora
                        .setMuted(
                            !currentlyMuted
                        );


                if (result.success) {

                    document
                        .getElementById(
                            'muteButton'
                        )
                        .textContent =
                            result.muted
                                ? 'Unmute'
                                : 'Mute';


                    console.log(
                        result.muted
                            ? 'ServiceCall microphone muted.'
                            : 'ServiceCall microphone unmuted.'
                    );
                }


            } catch (error) {

                console.error(
                    'ServiceCall mute failed:',
                    error
                );


                statusText.textContent =
                    'Unable to change microphone state';
            }
        }
    );

/* -------------------------
   END
------------------------- */

document
    .getElementById(
        'endButton'
    )
    .addEventListener(
        'click',
        async () => {

            try {

                const result =
                    await window
                        .serviceCall
                        .endCall(
                            callSysId
                        );


                if (
                    result &&
                    result.success
                ) {

                    await stopAgoraAudio();

                    setMode(
                        'completed'
                    );
                }

            } catch (error) {

                console.error(
                    'End call failed:',
                    error
                );

                statusText.textContent =
                    error.message ||
                    'Unable to end call.';
            }
        }
    );

/* -------------------------
   CLOSE CALL WINDOW
------------------------- */
 
function closeCallWindowAfterDelay() {
 
    if (closeTimer) {
        return;
    }
 
 
    closeTimer =
        setTimeout(
            () => {
 
                stopAllTimers();
 
                window.close();
 
            },
            1000
        );
}

/* -------------------------
   STOP TIMERS
------------------------- */

function stopAllTimers() {

    if (callStatusTimer) {

        clearInterval(
            callStatusTimer
        );

        callStatusTimer =
            null;
    }


    if (durationTimer) {

        clearInterval(
            durationTimer
        );

        durationTimer =
            null;
    }
}


/* -------------------------
   START
------------------------- */

setMode(
    currentMode
);

startCallStatusPolling();


window.addEventListener(
    'beforeunload',
    () => {

        stopAllTimers();

        stopRingtone();

        /*
         * Final media safety cleanup.
         *
         * Do not await here because the window
         * is already being destroyed.
         */
        stopAgoraAudio();
    }
);