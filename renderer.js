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