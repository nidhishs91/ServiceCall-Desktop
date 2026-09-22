const checkAccessButton =
    document.getElementById(
        'checkAccessButton'
    );

const accessStatusText =
    document.getElementById(
        'accessStatusText'
    );


let checkInProgress = false;


/* =========================================================
   CHECK ACCESS MANUALLY
========================================================= */

async function checkAccess() {

    if (checkInProgress) {
        return;
    }


    checkInProgress = true;


    checkAccessButton.disabled =
        true;

    checkAccessButton.textContent =
        'Checking...';

    accessStatusText.textContent =
        'Checking your ServiceCall access...';


    try {

        const result =
            await window.serviceCall
                .checkAccess();


        /*
         * ACCESS RESTORED MANUALLY
         *
         * main.js handles restoring the
         * ServiceCall runtime/application.
         */
        if (
            result &&
            result.state === 'ready'
        ) {

            accessStatusText.textContent =
                'ServiceCall access restored ✓ Reconnecting...';

            checkAccessButton.textContent =
                'Access restored';


            /*
             * Keep the page locked.
             *
             * main.js will transition the
             * application back to Home.
             */
            return;
        }


        /*
         * STILL NOT AUTHORIZED
         */
        if (
            result &&
            result.state ===
                'access_denied'
        ) {

            accessStatusText.textContent =
                'ServiceCall access is still unavailable.';


            return;
        }


        /*
         * LOGIN SESSION NO LONGER VALID
         */
        if (
            result &&
            result.state ===
                'login_required'
        ) {

            accessStatusText.textContent =
                'Your sign-in session is no longer available.';


            return;
        }


        /*
         * UNKNOWN RESULT
         */
        accessStatusText.textContent =
            'Unable to verify access at this time.';

    } catch (error) {

        console.error(
            'Unable to check ServiceCall access:',
            error
        );


        accessStatusText.textContent =
            'Unable to verify access. Please try again.';

    } finally {

        /*
         * If access was restored, keep the
         * button disabled while main.js
         * reconnects the application.
         */
        if (
            accessStatusText.textContent !==
            'ServiceCall access restored ✓ Reconnecting...'
        ) {

            checkInProgress =
                false;

            checkAccessButton.disabled =
                false;

            checkAccessButton.textContent =
                'Check access';
        }
    }
}


/* =========================================================
   MANUAL CHECK BUTTON
========================================================= */

checkAccessButton.addEventListener(
    'click',
    checkAccess
);


/* =========================================================
   RUNTIME AUTHORIZATION STATUS
========================================================= */

if (
    window.serviceCall &&
    typeof window.serviceCall
        .onAuthorizationStatus ===
        'function'
) {

    window.serviceCall
        .onAuthorizationStatus(
            (status) => {

                console.log(
                    'Runtime authorization status:',
                    status
                );


                /*
                 * ACCESS RESTORED BY THE
                 * BACKGROUND AUTHORIZATION
                 * MONITOR
                 */
                if (
                    status?.status ===
                    'access_restored'
                ) {

                    checkInProgress =
                        true;


                    checkAccessButton.disabled =
                        true;

                    checkAccessButton.textContent =
                        'Access restored';


                    accessStatusText.textContent =
                        'ServiceCall access restored ✓ Reconnecting...';
                }
            }
        );
}