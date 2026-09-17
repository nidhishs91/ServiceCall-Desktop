document.addEventListener(
    'DOMContentLoaded',
    async () => {

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

        const savedInstance =
            await window.serviceCall
                .getInstance();

        if (
            savedInstance.instanceUrl
        ) {
            input.value =
                savedInstance.instanceUrl;
        }

        const connectionStatus =
    await window.serviceCall
        .getConnectionStatus();

if (
    connectionStatus.connected
) {

    loginButton.disabled = true;

    loginButton.textContent =
        'Connected to ServiceNow';

    message.textContent =
        connectionStatus.message;

} else {

    loginButton.disabled = false;

    loginButton.textContent =
        'Sign in to ServiceNow';
}

        form.addEventListener(
            'submit',
            async (event) => {

                event.preventDefault();

                const instanceUrl =
                    input.value.trim();

                const result =
                    await window.serviceCall
                        .saveInstance(
                            instanceUrl
                        );

                message.textContent =
                    result.message;
            }
        );

        loginButton.addEventListener(
            'click',
            async () => {

                message.textContent =
                    'Opening ServiceNow sign-in...';

                const result =
                    await window.serviceCall
                        .startLogin();

                message.textContent =
                    result.message;
            }
        );
       window.serviceCall.onAuthStatus(
    (data) => {

        message.textContent =
            data.message || '';

        if (
            data.status === 'connected'
        ) {

            loginButton.disabled = true;

            loginButton.textContent =
                'Connected to ServiceNow';

        } else if (
            data.status === 'warning' ||
            data.status === 'error' ||
            data.status === 'authentication_required'
        ) {

            loginButton.disabled = false;

            loginButton.textContent =
                'Sign in to ServiceNow';
        }
    }
);
    }
);

const openActiveCallButton =
    document.getElementById(
        'openActiveCallButton'
    );


openActiveCallButton.addEventListener(
    'click',
    async () => {

        try {

            const result =
                await window.serviceCall
                    .openActiveCall();


            if (
                !result.active_call
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

            message.textContent =
                'Unable to open the active call.';
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
 