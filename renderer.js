document.addEventListener(
    'DOMContentLoaded',
    async () => {

        /* -------------------------------------------------
           ELEMENTS
        ------------------------------------------------- */

        const form =
            document.getElementById(
                'instanceForm'
            );

        const input =
            document.getElementById(
                'instanceUrl'
            );

        const message =
            document.getElementById(
                'instanceMessage'
            );

        const loginButton =
            document.getElementById(
                'loginButton'
            );

        const openActiveCallButton =
            document.getElementById(
                'openActiveCallButton'
            );

        const connectionPill =
            document.getElementById(
                'connectionPill'
            );

        const currentPageTitle =
            document.getElementById(
                'currentPageTitle'
            );

        const meetingsContainer =
            document.getElementById(
                'meetingsContainer'
            );

        const scheduleMeetingButton =
            document.getElementById(
                'scheduleMeetingButton'
            );


        /* -------------------------------------------------
           CONNECTION STATUS
        ------------------------------------------------- */

        function setConnectionDisplay(
            connected,
            text
        ) {

            if (!connectionPill) {
                return;
            }


            connectionPill.textContent =
                text;


            connectionPill.classList.toggle(
                'connected',
                connected
            );
        }


        /* -------------------------------------------------
           LOAD SAVED INSTANCE
        ------------------------------------------------- */

        try {

            const savedInstance =
                await window.serviceCall
                    .getInstance();


            if (
                input &&
                savedInstance.instanceUrl
            ) {

                input.value =
                    savedInstance.instanceUrl;
            }


        } catch (error) {

            console.error(
                'Unable to load saved ServiceNow instance:',
                error
            );
        }


        /* -------------------------------------------------
           CHECK CONNECTION
        ------------------------------------------------- */

        try {

            const connectionStatus =
                await window.serviceCall
                    .getConnectionStatus();


            if (
                connectionStatus.connected
            ) {

                loginButton.disabled =
                    true;

                loginButton.textContent =
                    'Connected to ServiceNow';


                setConnectionDisplay(
                    true,
                    'Connected'
                );


                if (message) {

                    message.textContent =
                        connectionStatus.message ||
                        '';
                }


            } else {

                loginButton.disabled =
                    false;

                loginButton.textContent =
                    'Sign in to ServiceNow';


                setConnectionDisplay(
                    false,
                    'Not connected'
                );
            }


        } catch (error) {

            console.error(
                'Unable to check ServiceCall connection:',
                error
            );


            setConnectionDisplay(
                false,
                'Connection unavailable'
            );
        }


        /* -------------------------------------------------
           SAVE INSTANCE
        ------------------------------------------------- */

        if (form) {

            form.addEventListener(
                'submit',

                async (event) => {

                    event.preventDefault();


                    const instanceUrl =
                        input.value.trim();


                    message.textContent =
                        'Saving ServiceNow instance...';


                    try {

                        const result =
                            await window
                                .serviceCall
                                .saveInstance(
                                    instanceUrl
                                );


                        message.textContent =
                            result.message ||
                            '';


                    } catch (error) {

                        console.error(
                            'Save instance failed:',
                            error
                        );


                        message.textContent =
                            'Unable to save the ServiceNow instance.';
                    }
                }
            );
        }


        /* -------------------------------------------------
           LOGIN
        ------------------------------------------------- */

        if (loginButton) {

            loginButton.addEventListener(
                'click',

                async () => {

                    message.textContent =
                        'Opening ServiceNow sign-in...';


                    try {

                        const result =
                            await window
                                .serviceCall
                                .startLogin();


                        message.textContent =
                            result.message ||
                            '';


                    } catch (error) {

                        console.error(
                            'ServiceNow login failed:',
                            error
                        );


                        message.textContent =
                            'Unable to start ServiceNow sign-in.';
                    }
                }
            );
        }


        /* -------------------------------------------------
           AUTH STATUS EVENTS
        ------------------------------------------------- */

        window.serviceCall.onAuthStatus(
            (data) => {

                if (message) {

                    message.textContent =
                        data.message ||
                        '';
                }


                if (
                    data.status ===
                    'connected'
                ) {

                    loginButton.disabled =
                        true;

                    loginButton.textContent =
                        'Connected to ServiceNow';


                    setConnectionDisplay(
                        true,
                        'Connected'
                    );


                } else if (
                    data.status === 'warning' ||
                    data.status === 'error' ||
                    data.status ===
                        'authentication_required'
                ) {

                    loginButton.disabled =
                        false;

                    loginButton.textContent =
                        'Sign in to ServiceNow';


                    setConnectionDisplay(
                        false,
                        'Connection required'
                    );
                }
            }
        );


        /* -------------------------------------------------
           OPEN ACTIVE CALL
        ------------------------------------------------- */

        if (openActiveCallButton) {

            openActiveCallButton.addEventListener(
                'click',

                async () => {

                    try {

                        const result =
                            await window
                                .serviceCall
                                .openActiveCall();


                        if (
                            !result.active_call &&
                            message
                        ) {

                            message.textContent =
                                result.message ||
                                'No active call is available.';
                        }


                    } catch (error) {

                        console.error(
                            'Open active call failed:',
                            error
                        );


                        if (message) {

                            message.textContent =
                                'Unable to open the active call.';
                        }
                    }
                }
            );
        }


        /* -------------------------------------------------
           SIDEBAR NAVIGATION
        ------------------------------------------------- */

        const navigationButtons =
            document.querySelectorAll(
                '.nav-button[data-view]'
            );


        const views =
            document.querySelectorAll(
                '.view'
            );


        navigationButtons.forEach(
            (button) => {

                button.addEventListener(
                    'click',

                    async () => {

                        const targetView =
                            button.dataset.view;


                        /*
                         * Hide all pages.
                         */
                        views.forEach(
                            (view) => {

                                view.classList.remove(
                                    'active'
                                );
                            }
                        );


                        /*
                         * Remove active state
                         * from navigation.
                         */
                        navigationButtons.forEach(
                            (navButton) => {

                                navButton.classList.remove(
                                    'active'
                                );
                            }
                        );


                        /*
                         * Show selected page.
                         */
                        const selectedView =
                            document.getElementById(
                                targetView
                            );


                        if (selectedView) {

                            selectedView.classList.add(
                                'active'
                            );
                        }


                        button.classList.add(
                            'active'
                        );


                        /*
                         * Update topbar title.
                         */
                        const pageName =
                            button.textContent.trim();


                        if (currentPageTitle) {

                            currentPageTitle.textContent =
                                pageName;
                        }


                        /*
                         * Meetings are loaded from
                         * ServiceNow whenever the user
                         * opens the Meetings page.
                         */
                        if (
                            targetView ===
                            'meetingsView'
                        ) {

                            await loadMeetings();
                        }
                    }
                );
            }
        );


        /* -------------------------------------------------
           MEETING HELPERS
        ------------------------------------------------- */

        function escapeHtml(
            value
        ) {

            return String(
                value || ''
            )
                .replace(
                    /&/g,
                    '&amp;'
                )
                .replace(
                    /</g,
                    '&lt;'
                )
                .replace(
                    />/g,
                    '&gt;'
                )
                .replace(
                    /"/g,
                    '&quot;'
                )
                .replace(
                    /'/g,
                    '&#039;'
                );
        }


        function formatMeetingDate(
            value
        ) {

            if (!value) {
                return '';
            }


            /*
             * ServiceNow returns:
             *
             * YYYY-MM-DD HH:mm:ss
             *
             * For now we display that authoritative
             * value without applying timezone
             * conversion in the renderer.
             */
            return value;
        }


        function getStatusClass(
            state
        ) {

            const normalized =
                String(
                    state || ''
                )
                    .toLowerCase()
                    .trim();


            if (
                normalized ===
                'in progress'
            ) {

                return 'in-progress';
            }


            if (
                normalized ===
                'scheduled'
            ) {

                return 'scheduled';
            }


            return '';
        }


        /* -------------------------------------------------
           RENDER MEETING
        ------------------------------------------------- */

        function createMeetingCard(
            meeting
        ) {

            const card =
                document.createElement(
                    'div'
                );


            card.className =
                'meeting-card';


            const statusClass =
                getStatusClass(
                    meeting.state
                );


            const organizer =
                meeting.organizer_name ||
                'Unknown organizer';


            card.innerHTML = `

                <div class="meeting-card-left">

                    <div class="meeting-title">
                        ${escapeHtml(
                            meeting.title ||
                            'Untitled meeting'
                        )}
                    </div>

                    <div class="meeting-meta">

                        ${escapeHtml(
                            meeting.meeting_number ||
                            ''
                        )}

                        <br>

                        ${escapeHtml(
                            formatMeetingDate(
                                meeting.scheduled_start
                            )
                        )}

                        ${
                            meeting.scheduled_end
                                ? ' – ' +
                                  escapeHtml(
                                      formatMeetingDate(
                                          meeting.scheduled_end
                                      )
                                  )
                                : ''
                        }

                        <br>

                        Organizer:
                        ${escapeHtml(
                            organizer
                        )}

                    </div>

                </div>


                <div class="meeting-actions">

                    <span
                        class="
                            meeting-status
                            ${statusClass}
                        "
                    >
                        ${escapeHtml(
                            meeting.state ||
                            'Unknown'
                        )}
                    </span>

                </div>
            `;


            /*
             * IMPORTANT:
             *
             * These buttons are based entirely
             * on permissions/actions returned
             * by ServiceNow.
             *
             * We are NOT deciding authorization
             * in the Desktop application.
             */

            const actions =
                card.querySelector(
                    '.meeting-actions'
                );


            if (
    meeting.can_start === true
) {

    const button =
        document.createElement(
            'button'
        );

    button.className =
        'primary-button';

    button.textContent =
        'Start';


    button.addEventListener(
        'click',

        async () => {

            /*
             * Prevent double-clicking Start.
             */
            button.disabled = true;

            button.textContent =
                'Starting...';


            try {

                const result =
                    await window
                        .serviceCall
                        .startMeeting(
                            meeting.meeting_sys_id
                        );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to start meeting.'
                    );
                }


                console.log(
                    'Meeting started:',
                    result
                );


                /*
                 * Refresh Meetings so the card
                 * changes from Scheduled to
                 * In Progress.
                 */
                await loadMeetings();


            } catch (error) {

                console.error(
                    'Start meeting failed:',
                    error
                );


                button.disabled = false;

                button.textContent =
                    'Start';


                if (message) {

                    message.textContent =
                        error.message ||
                        'Unable to start meeting.';
                }
            }
        }
    );


    actions.appendChild(
        button
    );
}


            if (
    meeting.can_join === true
) {

    const button =
        document.createElement(
            'button'
        );

    button.className =
        'primary-button';

    button.textContent =
        'Join';


    button.addEventListener(
        'click',

        async () => {

            button.disabled =
                true;

            button.textContent =
                'Joining...';


            try {

                const result =
                    await window
                        .serviceCall
                        .joinMeeting(
                            meeting.meeting_sys_id
                        );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to join meeting.'
                    );
                }


                console.log(
                    'Meeting joined:',
                    result
                );


                /*
                 * Refresh the card because
                 * can_join / can_leave may
                 * now have changed.
                 */
                await loadMeetings();


            } catch (error) {

                console.error(
                    'Join meeting failed:',
                    error
                );


                button.disabled =
                    false;

                button.textContent =
                    'Join';


                if (message) {

                    message.textContent =
                        error.message ||
                        'Unable to join meeting.';
                }
            }
        }
    );


    actions.appendChild(
        button
    );
}


            if (
    meeting.can_leave === true
) {

    const button =
        document.createElement(
            'button'
        );

    button.className =
        'secondary-button';

    button.textContent =
        'Leave';


    button.addEventListener(
        'click',

        async () => {

            button.disabled =
                true;

            button.textContent =
                'Leaving...';


            try {

                const result =
                    await window
                        .serviceCall
                        .leaveMeeting(
                            meeting.meeting_sys_id
                        );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to leave meeting.'
                    );
                }


                console.log(
                    'Meeting left:',
                    result
                );


                await loadMeetings();


            } catch (error) {

                console.error(
                    'Leave meeting failed:',
                    error
                );


                button.disabled =
                    false;

                button.textContent =
                    'Leave';


                if (message) {

                    message.textContent =
                        error.message ||
                        'Unable to leave meeting.';
                }
            }
        }
    );


    actions.appendChild(
        button
    );
}


            if (
    meeting.can_end === true
) {

    const button =
        document.createElement(
            'button'
        );

    button.className =
        'danger-button';

    button.textContent =
        'End';


    button.addEventListener(
        'click',

        async () => {

            /*
             * Prevent accidental double-clicks.
             */
            button.disabled =
                true;

            button.textContent =
                'Ending...';


            try {

                const result =
                    await window
                        .serviceCall
                        .endMeeting(
                            meeting.meeting_sys_id
                        );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to end meeting.'
                    );
                }


                console.log(
                    'Meeting ended:',
                    result
                );


                /*
                 * Refresh meeting cards.
                 * The ended meeting should now
                 * display as Ended and its live
                 * action buttons disappear.
                 */
                await loadMeetings();


            } catch (error) {

                console.error(
                    'End meeting failed:',
                    error
                );


                button.disabled =
                    false;

                button.textContent =
                    'End';


                if (message) {

                    message.textContent =
                        error.message ||
                        'Unable to end meeting.';
                }
            }
        }
    );


    actions.appendChild(
        button
    );
}

if (
    meeting.can_cancel === true
) {

    const button =
        document.createElement(
            'button'
        );

    button.className =
        'danger-button';

    button.textContent =
        'Cancel';


    button.addEventListener(
        'click',

        async () => {

            button.disabled =
                true;

            button.textContent =
                'Cancelling...';


            try {

                const result =
                    await window
                        .serviceCall
                        .cancelMeeting(
                            meeting.meeting_sys_id
                        );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to cancel meeting.'
                    );
                }


                console.log(
                    'Meeting cancelled:',
                    result
                );


                /*
                 * Refresh meeting cards.
                 *
                 * State should now be Cancelled
                 * and Start / Cancel disappear.
                 */
                await loadMeetings();


            } catch (error) {

                console.error(
                    'Cancel meeting failed:',
                    error
                );


                button.disabled =
                    false;

                button.textContent =
                    'Cancel';


                if (message) {

                    message.textContent =
                        error.message ||
                        'Unable to cancel meeting.';
                }
            }
        }
    );


    actions.appendChild(
        button
    );
}


            return card;
        }


        /* -------------------------------------------------
           LOAD MEETINGS
        ------------------------------------------------- */

        async function loadMeetings() {

            if (!meetingsContainer) {
                return;
            }


            meetingsContainer.innerHTML = `
                <div class="loading">
                    Loading your meetings...
                </div>
            `;


            try {

                const result =
                    await window
                        .serviceCall
                        .getMyMeetings();


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result &&
                        result.message
                            ? result.message
                            : 'Unable to retrieve meetings.'
                    );
                }


                const meetings =
                    Array.isArray(
                        result.meetings
                    )
                        ? result.meetings
                        : [];


                meetingsContainer.innerHTML =
                    '';


                if (
                    meetings.length === 0
                ) {

                    meetingsContainer.innerHTML = `
                        <div class="empty-state">
                            You don't have any ServiceCall meetings yet.
                        </div>
                    `;

                    return;
                }


                meetings.forEach(
                    (meeting) => {

                        meetingsContainer.appendChild(
                            createMeetingCard(
                                meeting
                            )
                        );
                    }
                );


            } catch (error) {

                console.error(
                    'Unable to load meetings:',
                    error
                );


                meetingsContainer.innerHTML = `
                    <div class="empty-state">
                        Unable to load your meetings.
                    </div>
                `;
            }
        }

        
/* =======================================================
   MEETING CHANGE REFRESH
======================================================= */

if (
    window.serviceCall &&
    typeof window.serviceCall
        .onMeetingChanged ===
        'function'
) {

    window.serviceCall
        .onMeetingChanged(
            async (data) => {

                console.log(
                    'ServiceCall meeting changed:',
                    data
                );

                await loadMeetings();
            }
        );
}


        /* -------------------------------------------------
           SCHEDULE MEETING
        ------------------------------------------------- */

        if (scheduleMeetingButton) {

            scheduleMeetingButton.addEventListener(
                'click',
                () => {

                    /*
                     * We intentionally haven't wired
                     * /create-meeting yet.
                     */
                    console.log(
                        'Schedule Meeting clicked.'
                    );
                }
            );
        }

    }
);

const refreshRecordingsButton =
    document.getElementById(
        'refreshRecordingsButton'
    );
 
 
const recordingsMessage =
    document.getElementById(
        'recordingsMessage'
    );
 
 
const recordingsList =
    document.getElementById(
        'recordingsList'
    );
 
 
async function loadRecordingHistory() {
 
    if (
        !recordingsMessage ||
        !recordingsList
    ) {
        return;
    }
 
 
    recordingsMessage.textContent =
        'Loading recordings...';
 
 
    recordingsList.innerHTML =
        '';
 
 
    try {
 
        const result =
            await window.serviceCall
                .getRecordingHistory();
 
 
        if (
            !result ||
            result.success !== true
        ) {
 
            recordingsMessage.textContent =
                result &&
                result.message
                    ? result.message
                    : 'Unable to load recordings.';
 
            return;
        }
 
 
        const recordings =
            Array.isArray(
                result.recordings
            )
                ? result.recordings
                : [];
 
 
        if (
            recordings.length === 0
        ) {
 
            recordingsMessage.textContent =
                'No recordings found.';
 
            return;
        }
 
 
        recordingsMessage.textContent =
            recordings.length +
            (
                recordings.length === 1
                    ? ' recording'
                    : ' recordings'
            );
 
 
        recordings.forEach(
            (recording) => {
 
                const card =
                    document.createElement(
                        'div'
                    );
 
 
                card.style.cssText = `
                    border:1px solid #dfe8e5;
                    border-radius:10px;
                    padding:16px;
                    margin-bottom:12px;
                    background:#ffffff;
                `;
 
 
                /*
                 * ---------------------------------
                 * HEADER
                 * ---------------------------------
                 */
 
                const title =
                    document.createElement(
                        'div'
                    );
 
 
                title.style.cssText = `
                    font-weight:600;
                    font-size:15px;
                    margin-bottom:8px;
                `;
 
 
                title.textContent =
                    recording.number ||
                    'ServiceCall Recording';
 
 
                card.appendChild(
                    title
                );
 
 
                /*
                 * ---------------------------------
                 * DETAILS
                 * ---------------------------------
                 */
 
                const details =
                    document.createElement(
                        'div'
                    );
 
 
                details.style.cssText = `
                    font-size:13px;
                    line-height:1.7;
                    color:#52635f;
                `;
 
 
                const participants =
                    Array.isArray(
                        recording.participants
                    )
                        ? recording.participants
                            .join(', ')
                        : '';
 
 
                details.textContent =
                    'Call: ' +
                    (
                        recording.call_number ||
                        '-'
                    ) +
                    '\n' +
 
                    'Participants: ' +
                    (
                        participants ||
                        '-'
                    ) +
                    '\n' +
 
                    'Status: ' +
                    (
                        recording.status ||
                        '-'
                    ) +
                    '\n' +
 
                    'Format: ' +
                    (
                        recording.format ||
                        '-'
                    ) +
                    '\n' +
 
                    'Started: ' +
                    (
                        recording.started_at ||
                        '-'
                    );
 
 
                details.style.whiteSpace =
                    'pre-line';
 
 
                card.appendChild(
                    details
                );
 
 
                /*
                 * ---------------------------------
                 * AVAILABLE → DOWNLOAD
                 * ---------------------------------
                 */
 
                if (
                    recording.status ===
                    'available'
                ) {
 
                    const downloadButton =
                        document.createElement(
                            'button'
                        );
 
 
                    downloadButton.type =
                        'button';
 
 
                    downloadButton.className =
                        'button';
 
 
                    downloadButton.textContent =
                        'Download';
 
 
                    downloadButton.style.marginTop =
                        '12px';
 
 
                    downloadButton.addEventListener(
                        'click',
 
                        async () => {
 
                            downloadButton.disabled =
                                true;
 
 
                            downloadButton.textContent =
                                'Downloading...';
 
 
                            try {
 
                                const downloadResult =
                                    await window
                                        .serviceCall
                                        .downloadRecording(
                                            recording
                                                .recording_sys_id
                                        );
 
 
                                if (
                                    downloadResult &&
                                    downloadResult.success
                                ) {
 
                                    recordingsMessage
                                        .textContent =
                                        'Recording downloaded successfully.';
 
                                } else if (
                                    downloadResult &&
                                    downloadResult.code ===
                                        'DOWNLOAD_CANCELLED'
                                ) {
 
                                    recordingsMessage
                                        .textContent =
                                        'Download cancelled.';
 
                                } else {
 
                                    recordingsMessage
                                        .textContent =
                                        downloadResult &&
                                        downloadResult.message
                                            ? downloadResult.message
                                            : 'Unable to download recording.';
                                }
 
 
                            } catch (error) {
 
                                recordingsMessage
                                    .textContent =
                                    error.message ||
                                    'Unable to download recording.';
 
                            } finally {
 
                                downloadButton.disabled =
                                    false;
 
 
                                downloadButton.textContent =
                                    'Download';
                            }
                        }
                    );
 
 
                    card.appendChild(
                        downloadButton
                    );
                }
 
 
                /*
                 * ---------------------------------
                 * PROCESSING
                 * ---------------------------------
                 */
 
                if (
                    recording.status ===
                    'processing'
                ) {
 
                    const state =
                        document.createElement(
                            'div'
                        );
 
 
                    state.style.cssText = `
                        margin-top:12px;
                        font-size:13px;
                        color:#667773;
                    `;
 
 
                    state.textContent =
                        'Recording is being processed...';
 
 
                    card.appendChild(
                        state
                    );
                }
 
 
                /*
                 * ---------------------------------
                 * EXPIRED
                 * ---------------------------------
                 */
 
                if (
                    recording.status ===
                    'expired'
                ) {
 
                    const state =
                        document.createElement(
                            'div'
                        );
 
 
                    state.style.cssText = `
                        margin-top:12px;
                        font-size:13px;
                        color:#667773;
                    `;
 
 
                    state.textContent =
                        'Recording expired';
 
 
                    card.appendChild(
                        state
                    );
                }
 
 
                recordingsList.appendChild(
                    card
                );
            }
        );
 
 
    } catch (error) {
 
        console.error(
            'Unable to load recording history:',
            error
        );
 
 
        recordingsMessage.textContent =
            error.message ||
            'Unable to load recordings.';
    }
}
 
 
if (
    refreshRecordingsButton
) {
 
    refreshRecordingsButton.addEventListener(
        'click',
        loadRecordingHistory
    );
}
 