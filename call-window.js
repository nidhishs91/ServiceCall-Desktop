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

const isConference =
    params.get('isConference') === 'true';

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

let currentUserIsOwner =
    false;

let participantRole =
    'participant';

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


    if (!callSysId) {

        console.error(
            'ServiceCall call sys_id is missing.'
        );

        statusText.textContent =
            'Audio configuration unavailable';

        return;
    }


    agoraJoining =
        true;


    try {

        console.log(
            'ServiceCall requesting dynamic media credentials...'
        );


        /*
         * Request short-lived credentials
         * for THIS specific ServiceCall call.
         *
         * Electron -> ServiceNow
         * -> Cloudflare Worker -> Agora token
         */
        const credentials =
            await window.serviceCall
                .getMediaCredentials(
                    callSysId
                );


        if (
            !credentials ||
            !credentials.success
        ) {

            throw new Error(
                credentials &&
                credentials.message
                    ? credentials.message
                    : 'Media credentials could not be obtained.'
            );
        }


        const media =
            credentials.media;


        if (
            !media ||
            !media.app_id ||
            !media.channel ||
            !media.token ||
            !media.uid
        ) {

            throw new Error(
                'ServiceCall returned incomplete media credentials.'
            );
        }


        console.log(
            'ServiceCall media credentials received.',
            'Channel:',
            media.channel,
            'UID:',
            media.uid
        );


        /*
         * IMPORTANT:
         *
         * Never log media.token.
         */


        console.log(
            'ServiceCall joining Agora audio channel...'
        );


        await window.ServiceCallAgora.join({

            appId:
                media.app_id,

            token:
                media.token,

            channel:
                media.channel,

            uid:
                media.uid,


            /*
             * TOKEN RENEWAL CALLBACK
             *
             * agora-service.js calls this
             * when Agora warns that the
             * current token will expire.
             *
             * We request fresh credentials
             * for the SAME ServiceCall call.
             */
            renewToken:
                async () => {

                    console.log(
                        'ServiceCall requesting renewed media credentials...'
                    );


                    const renewedCredentials =
                        await window.serviceCall
                            .getMediaCredentials(
                                callSysId
                            );


                    if (
                        !renewedCredentials ||
                        !renewedCredentials.success
                    ) {

                        throw new Error(
                            renewedCredentials &&
                            renewedCredentials.message
                                ? renewedCredentials.message
                                : 'Unable to obtain renewed media credentials.'
                        );
                    }


                    const renewedMedia =
                        renewedCredentials.media;


                    if (
                        !renewedMedia ||
                        !renewedMedia.token
                    ) {

                        throw new Error(
                            'ServiceCall returned an incomplete renewed media token.'
                        );
                    }


                    /*
                     * Safety check:
                     *
                     * Renewal must remain on
                     * the SAME Agora channel
                     * and SAME participant UID.
                     */
                    if (
                        renewedMedia.channel !==
                        media.channel
                    ) {

                        throw new Error(
                            'Renewed media channel does not match the active call.'
                        );
                    }


                    if (
                        Number(
                            renewedMedia.uid
                        ) !==
                        Number(
                            media.uid
                        )
                    ) {

                        throw new Error(
                            'Renewed media UID does not match the active participant.'
                        );
                    }


                    console.log(
                        'ServiceCall renewed media credentials received.',
                        'Channel:',
                        renewedMedia.channel,
                        'UID:',
                        renewedMedia.uid
                    );


                    /*
                     * NEVER log renewedMedia.token.
                     *
                     * Return only the token to
                     * agora-service.js.
                     */
                    return renewedMedia.token;
                }
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
            isConference
                ? 'Conference call'
                : 'is calling you...';

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

        /* -------------------------
   OWNER / PARTICIPANT STATE
------------------------- */

currentUserIsOwner =
    result.is_owner === true;


participantRole =
    result.participant_role ||
    'participant';


const endButton =
    document.getElementById(
        'endButton'
    );


if (currentUserIsOwner) {

    endButton.textContent =
        'End Conference';

} else {

    endButton.textContent =
        'Leave Call';
}


/* -------------------------
   PARTICIPANT LEFT
------------------------- */

const participantStatus =
    result.participant_status ||
    '';


if (
    participantStatus === 'left' ||
    participantStatus === 'disconnected'
) {

    /*
     * The overall conference may still be
     * connected, but THIS participant is
     * no longer part of it.
     */

    await stopAgoraAudio();

    stopRingtone();

    stopAllTimers();

    statusText.textContent =
        participantStatus === 'left'
            ? 'You left the call'
            : 'Call ended';

    closeCallWindowAfterDelay();

    return;
}

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
   ADD PARTICIPANT
------------------------- */

const addUserButton =
    document.getElementById(
        'addUserButton'
    );

const addParticipantModal =
    document.getElementById(
        'addParticipantModal'
    );

const closeParticipantModalButton =
    document.getElementById(
        'closeParticipantModal'
    );

const participantSearch =
    document.getElementById(
        'participantSearch'
    );

const participantResults =
    document.getElementById(
        'participantResults'
    );

const participantMessage =
    document.getElementById(
        'participantMessage'
    );


let participantSearchTimer =
    null;


/* -------------------------
   OPEN MODAL
------------------------- */

function openParticipantModal() {

    participantMessage.textContent =
        '';

    participantMessage.className =
        'participant-message';


    participantSearch.value =
        '';


    participantResults.innerHTML =
        '<div class="participant-empty">' +
        'Start typing a user\'s name.' +
        '</div>';


    addParticipantModal
        .classList
        .remove(
            'hidden'
        );


    setTimeout(
        () => {

            participantSearch.focus();

        },
        100
    );
}


/* -------------------------
   CLOSE MODAL
------------------------- */

function closeParticipantModal() {

    addParticipantModal
        .classList
        .add(
            'hidden'
        );


    if (participantSearchTimer) {

        clearTimeout(
            participantSearchTimer
        );

        participantSearchTimer =
            null;
    }
}


/* -------------------------
   SEARCH USERS
------------------------- */

async function searchParticipantUsers() {

    const searchText =
        participantSearch
            .value
            .trim();


    participantMessage.textContent =
        '';

    participantMessage.className =
        'participant-message';


    if (
        searchText.length < 2
    ) {

        participantResults.innerHTML =
            '<div class="participant-empty">' +
            'Enter at least 2 characters.' +
            '</div>';

        return;
    }


    participantResults.innerHTML =
        '<div class="participant-empty">' +
        'Searching...' +
        '</div>';


    try {

        const result =
            await window.serviceCall
                .searchUsers(
                    searchText
                );


        /*
         * Ignore an old search result if the
         * user has already typed something else.
         */
        if (
            participantSearch
                .value
                .trim() !==
            searchText
        ) {
            return;
        }


        if (
            !result ||
            !result.success
        ) {

            throw new Error(
                result &&
                result.message
                    ? result.message
                    : 'Unable to search users.'
            );
        }


        const users =
            Array.isArray(
                result.users
            )
                ? result.users
                : [];


        if (
            users.length === 0
        ) {

            participantResults.innerHTML =
                '<div class="participant-empty">' +
                'No matching users found.' +
                '</div>';

            return;
        }


        /*
         * Build results safely with DOM APIs.
         * Do not inject ServiceNow user values
         * directly into HTML.
         */
        participantResults.innerHTML =
            '';


        users.forEach(
            (user) => {

                const row =
                    document.createElement(
                        'div'
                    );

                row.className =
                    'participant-result';


                const details =
                    document.createElement(
                        'div'
                    );

                details.className =
                    'participant-details';


                const name =
                    document.createElement(
                        'div'
                    );

                name.className =
                    'participant-name';

                name.textContent =
                    user.name ||
                    'Unknown User';


                const subtitle =
                    document.createElement(
                        'div'
                    );

                subtitle.className =
                    'participant-subtitle';


                const subtitleParts =
                    [];


                if (user.department) {

                    subtitleParts.push(
                        user.department
                    );
                }


                if (user.email) {

                    subtitleParts.push(
                        user.email
                    );
                }


                subtitle.textContent =
                    subtitleParts.join(
                        ' • '
                    ) ||
                    user.user_name ||
                    'ServiceNow user';


                details.appendChild(
                    name
                );

                details.appendChild(
                    subtitle
                );


                const addButton =
                    document.createElement(
                        'button'
                    );

                addButton.className =
                    'participant-add';

                addButton.textContent =
                    'Add';


                addButton.addEventListener(
                    'click',
                    async () => {

                        await inviteServiceCallParticipant(
                            user,
                            addButton
                        );
                    }
                );


                row.appendChild(
                    details
                );

                row.appendChild(
                    addButton
                );


                participantResults.appendChild(
                    row
                );
            }
        );


    } catch (error) {

        console.error(
            'ServiceCall user search failed:',
            error
        );


        participantResults.innerHTML =
            '<div class="participant-empty">' +
            'Unable to search users.' +
            '</div>';


        participantMessage.textContent =
            error.message ||
            'Unable to search users.';

        participantMessage.className =
            'participant-message error';
    }
}


/* -------------------------
   INVITE USER
------------------------- */

async function inviteServiceCallParticipant(
    user,
    addButton
) {

    if (
        !user ||
        !user.sys_id
    ) {
        return;
    }


    addButton.disabled =
        true;

    addButton.textContent =
        'Adding...';


    participantMessage.textContent =
        'Inviting ' +
        (
            user.name ||
            'user'
        ) +
        '...';

    participantMessage.className =
        'participant-message';


    try {

        const result =
            await window.serviceCall
                .inviteParticipant(
                    callSysId,
                    user.sys_id
                );


        if (
            !result ||
            !result.success
        ) {

            throw new Error(
                result &&
                result.message
                    ? result.message
                    : 'Unable to invite participant.'
            );
        }


        addButton.textContent =
            'Invited';


        participantMessage.textContent =
            (
                user.name ||
                'Participant'
            ) +
            ' has been invited to the call.';

        participantMessage.className =
            'participant-message success';


        /*
         * Leave the success message visible
         * briefly, then close the modal.
         */
        setTimeout(
            () => {

                closeParticipantModal();

            },
            1000
        );


    } catch (error) {

        console.error(
            'ServiceCall participant invite failed:',
            error
        );


        addButton.disabled =
            false;

        addButton.textContent =
            'Add';


        participantMessage.textContent =
            error.message ||
            'Unable to invite participant.';

        participantMessage.className =
            'participant-message error';
    }
}


/* -------------------------
   ADD USER EVENTS
------------------------- */

addUserButton.addEventListener(
    'click',
    () => {

        if (
            currentMode !==
            'connected'
        ) {
            return;
        }


        openParticipantModal();
    }
);


closeParticipantModalButton
    .addEventListener(
        'click',
        closeParticipantModal
    );


/*
 * Clicking the dark area outside
 * the card closes the modal.
 */
addParticipantModal.addEventListener(
    'click',
    (event) => {

        if (
            event.target ===
            addParticipantModal
        ) {

            closeParticipantModal();
        }
    }
);


/*
 * Escape closes the modal.
 */
document.addEventListener(
    'keydown',
    (event) => {

        if (
            event.key ===
            'Escape' &&
            !addParticipantModal
                .classList
                .contains(
                    'hidden'
                )
        ) {

            closeParticipantModal();
        }
    }
);


/*
 * Small debounce so we don't hit
 * ServiceNow on every keystroke.
 */
participantSearch.addEventListener(
    'input',
    () => {

        if (participantSearchTimer) {

            clearTimeout(
                participantSearchTimer
            );
        }


        participantSearchTimer =
            setTimeout(
                searchParticipantUsers,
                350
            );
    }
);

/* -------------------------
   END CONFERENCE / LEAVE CALL
------------------------- */

document
    .getElementById(
        'endButton'
    )
    .addEventListener(
        'click',
        async () => {

            const endButton =
                document.getElementById(
                    'endButton'
                );


            endButton.disabled =
                true;


            try {

                let result;


                /* -------------------------
                   OWNER
                ------------------------- */

                if (currentUserIsOwner) {

                    statusText.textContent =
                        'Ending conference...';


                    result =
                        await window
                            .serviceCall
                            .endCall(
                                callSysId
                            );


                    if (
                        !result ||
                        !result.success
                    ) {

                        throw new Error(
                            result &&
                            result.message
                                ? result.message
                                : 'Unable to end conference.'
                        );
                    }


                    await stopAgoraAudio();


                    setMode(
                        'completed'
                    );

                    return;
                }


                /* -------------------------
                   PARTICIPANT
                ------------------------- */

                statusText.textContent =
                    'Leaving call...';


                result =
                    await window
                        .serviceCall
                        .leaveCall(
                            callSysId
                        );


                if (
                    !result ||
                    !result.success
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to leave call.'
                    );
                }


                /*
                 * Leave Agora only on THIS desktop.
                 *
                 * Other conference participants
                 * remain in the same Agora channel.
                 */
                await stopAgoraAudio();


                stopAllTimers();

                stopRingtone();


                statusText.textContent =
                    'You left the call';


                closeCallWindowAfterDelay();


            } catch (error) {

                console.error(
                    currentUserIsOwner
                        ? 'End conference failed:'
                        : 'Leave call failed:',
                    error
                );


                statusText.textContent =
                    error.message ||
                    (
                        currentUserIsOwner
                            ? 'Unable to end conference.'
                            : 'Unable to leave call.'
                    );


                endButton.disabled =
                    false;
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