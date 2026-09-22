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
   CHECK ACCESS
========================================================= */
 
async function checkAccess() {
 
    if (checkInProgress) {
        return;
    }
 
 
    checkInProgress = true;
 
 
    checkAccessButton.disabled = true;
 
    checkAccessButton.textContent =
        'Checking...';
 
    accessStatusText.textContent =
        'Checking your ServiceCall access...';
 
 
    try {
 
        const result =
            await window.serviceCall.checkAccess();
 
 
        /*
         * ACCESS RESTORED
         *
         * main.js will handle:
         *
         * - updating authorization
         * - resuming runtime
         * - returning to index.html
         */
 
        if (
            result &&
            result.state === 'ready'
        ) {
 
            accessStatusText.textContent =
                'Access restored. Opening ServiceCall...';
 
            checkAccessButton.textContent =
                'Access restored';
 
            return;
        }
 
 
        /*
         * STILL NOT AUTHORIZED
         */
 
        if (
            result &&
            result.state === 'access_denied'
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
            result.state === 'login_required'
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
         * If access was restored, index.html may already
         * be loading. Otherwise restore the button.
         */
 
        if (
            accessStatusText.textContent !==
            'Access restored. Opening ServiceCall...'
        ) {
 
            checkInProgress = false;
 
            checkAccessButton.disabled = false;
 
            checkAccessButton.textContent =
                'Check access';
        }
    }
}
 
 
/* =========================================================
   BUTTON
========================================================= */
 
checkAccessButton.addEventListener(
    'click',
    checkAccess
);
 