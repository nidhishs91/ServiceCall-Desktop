const checkingView =
    document.getElementById(
        'checkingView'
    );

const loginView =
    document.getElementById(
        'loginView'
    );

const accountChooserView =
    document.getElementById(
        'accountChooserView'
    );

const accountSearchInput =
    document.getElementById(
        'accountSearchInput'
    );

const savedAccountsContainer =
    document.getElementById(
        'savedAccountsContainer'
    );

const backToAccountsButton =
    document.getElementById(
        'backToAccountsButton'
    );

const viewAllAccountsButton =
    document.getElementById(
        'viewAllAccountsButton'
    );

const addAccountButton =
    document.getElementById(
        'addAccountButton'
    );

const accountChooserMessage =
    document.getElementById(
        'accountChooserMessage'
    );


let savedAccounts = [];

let showAllAccounts = false;


const authenticatingView =
    document.getElementById(
        'authenticatingView'
    );

const accessDeniedView =
    document.getElementById(
        'accessDeniedView'
    );

const accessDeniedUser =
    document.getElementById(
        'accessDeniedUser'
    );

const checkAccessButton =
    document.getElementById(
        'checkAccessButton'
    );


/*
 * -----------------------------------------
 * ACCESS-DENIED AUTO CHECK
 * -----------------------------------------
 */

let accessCheckTimer = null;

let accessCheckInProgress = false;

const ACCESS_CHECK_INTERVAL_MS =
    30000;


const useAnotherAccountButton =
    document.getElementById(
        'useAnotherAccountButton'
    );

const errorView =
    document.getElementById(
        'errorView'
    );

const instanceInput =
    document.getElementById(
        'instanceInput'
    );

const connectButton =
    document.getElementById(
        'connectButton'
    );

const retryButton =
    document.getElementById(
        'retryButton'
    );

const authMessage =
    document.getElementById(
        'authMessage'
    );

const errorMessage =
    document.getElementById(
        'errorMessage'
    );


/*
 * -----------------------------------------
 * VIEW MANAGEMENT
 * -----------------------------------------
 */

function showView(view) {

    const views = [
        checkingView,
        loginView,
        authenticatingView,
        errorView,
        accessDeniedView,
        accountChooserView
    ];


    views.forEach(
        (item) => {

            if (item) {

                item.classList.add(
                    'hidden'
                );
            }
        }
    );


    if (view) {

        view.classList.remove(
            'hidden'
        );
    }
}


/*
 * -----------------------------------------
 * LOGIN VIEW
 * -----------------------------------------
 */

function showLogin() {

    /*
     * Login is no longer the access-denied
     * waiting state, so stop its timer.
     */
    stopAccessCheckPolling();


    showView(
        loginView
    );


    /*
     * Back to Accounts is useful only when
     * this device already has saved
     * ServiceCall accounts.
     */
    if (backToAccountsButton) {

        backToAccountsButton.classList.toggle(
            'hidden',
            savedAccounts.length === 0
        );
    }


    if (authMessage) {

        authMessage.textContent =
            '';
    }


    if (instanceInput) {

        instanceInput.focus();
    }
}

/*
 * -----------------------------------------
 * AUTHENTICATING VIEW
 * -----------------------------------------
 */

function showAuthenticating() {

    stopAccessCheckPolling();


    showView(
        authenticatingView
    );
}


/*
 * -----------------------------------------
 * ACCESS-DENIED AUTO CHECK
 * -----------------------------------------
 */

function stopAccessCheckPolling() {

    if (accessCheckTimer) {

        clearInterval(
            accessCheckTimer
        );

        accessCheckTimer =
            null;
    }
}


async function checkAccessAutomatically() {

    /*
     * Prevent overlapping automatic
     * access checks.
     */
    if (accessCheckInProgress) {

        return;
    }


    /*
     * Automatic checking is only valid
     * while the OLD auth-gate access
     * unavailable screen is visible.
     */
    if (
        !accessDeniedView ||
        accessDeniedView.classList.contains(
            'hidden'
        )
    ) {

        return;
    }


    accessCheckInProgress =
        true;


    try {

        if (accessDeniedUser) {

            accessDeniedUser.textContent =
                'Waiting for ServiceCall access...';
        }


        const result =
            await window.serviceCall
                .checkAccess();


        /*
         * ACCESS STILL NOT ASSIGNED
         */

        if (
            result?.state ===
            'access_denied'
        ) {

            if (accessDeniedUser) {

                accessDeniedUser.textContent =
                    'Waiting for ServiceCall access...';
            }


            return;
        }


        /*
         * ACCESS HAS NOW BEEN ASSIGNED
         */

        if (
            result?.state ===
            'ready'
        ) {

            stopAccessCheckPolling();


            if (accessDeniedUser) {

                accessDeniedUser.textContent =
                    'ServiceCall access assigned. Signing you in...';
            }


            /*
             * Keep the successful state visible
             * before entering ServiceCall.
             */
            await new Promise(
                (resolve) => {

                    setTimeout(
                        resolve,
                        3500
                    );
                }
            );


            window.location.href =
                '../index.html';


            return;
        }


        /*
         * SAVED AUTHENTICATION IS NO
         * LONGER VALID
         */

        if (
            result?.state ===
            'login_required'
        ) {

            stopAccessCheckPolling();


            showLogin();


            if (authMessage) {

                authMessage.textContent =
                    'Your saved session has expired. Please sign in again.';
            }


            return;
        }


        console.warn(
            'Unexpected automatic ServiceCall access-check result:',
            result
        );

    } catch (error) {

        /*
         * Temporary network/request failures
         * should not throw the user out of
         * the waiting screen.
         */
        console.warn(
            'Automatic ServiceCall access check failed:',
            error
        );


        if (accessDeniedUser) {

            accessDeniedUser.textContent =
                'Unable to check access right now. Retrying automatically...';
        }

    } finally {

        accessCheckInProgress =
            false;
    }
}


function startAccessCheckPolling() {

    stopAccessCheckPolling();


    accessCheckTimer =
        setInterval(
            checkAccessAutomatically,
            ACCESS_CHECK_INTERVAL_MS
        );
}


function showAccessDenied(
    message
) {

    showView(
        accessDeniedView
    );


    if (accessDeniedUser) {

        accessDeniedUser.textContent =
            message ||
            'Waiting for ServiceCall access...';
    }


    /*
     * Start lightweight authorization
     * checking only while the OLD
     * auth-gate access-denied page
     * is active.
     */
    startAccessCheckPolling();
}


/*
 * -----------------------------------------
 * USE ANOTHER ACCOUNT
 * -----------------------------------------
 */

useAnotherAccountButton?.addEventListener(
    'click',
    async () => {

        stopAccessCheckPolling();


        try {

            /*
             * Return to the saved-account
             * chooser.
             */
            await showAccountChooser();

        } catch (error) {

            console.error(
                'Unable to open account chooser:',
                error
            );


            /*
             * Safe fallback.
             */
            showLogin();


            if (authMessage) {

                authMessage.textContent =
                    'You can sign in with another ServiceNow account.';
            }
        }
    }
);


/*
 * -----------------------------------------
 * ACCOUNT ROLE LABEL
 * -----------------------------------------
 */

function getAccountRoleLabel(
    account
) {

    if (
        account.isServiceCallAdmin
    ) {

        return 'ServiceCall Admin';
    }


    if (
        account.isServiceCallUser
    ) {

        return 'ServiceCall User';
    }


    return 'No ServiceCall Access';
}


/*
 * -----------------------------------------
 * RENDER SAVED ACCOUNTS
 * -----------------------------------------
 */

function renderSavedAccounts() {

    if (!savedAccountsContainer) {

        return;
    }


    savedAccountsContainer.innerHTML =
        '';


    const searchText =
        String(
            accountSearchInput?.value ||
            ''
        )
        .trim()
        .toLowerCase();


    const filteredAccounts =
        savedAccounts.filter(
            (account) => {

                if (!searchText) {

                    return true;
                }


                const searchableText = [
                    account.name,
                    account.userName,
                    account.email,
                    account.serviceCallId,
                    account.instanceUrl
                ]
                .join(' ')
                .toLowerCase();


                return searchableText.includes(
                    searchText
                );
            }
        );


    /*
     * Search always shows all matches.
     *
     * Otherwise show the five most
     * recently used accounts unless
     * View All is selected.
    */

    const accountsToRender = filteredAccounts;


    if (
        accountsToRender.length === 0
    ) {

        savedAccountsContainer.innerHTML =
            '<div class="account-search-empty">' +
            'No accounts found.' +
            '</div>';

    } else {

        accountsToRender.forEach(
            (account) => {

                const button =
                    document.createElement(
                        'button'
                    );


                button.type =
                    'button';

                button.className =
                    'saved-account';


                const name =
                    account.name ||
                    account.userName ||
                    'ServiceCall User';


                const details = [
                    account.userName
                        ? '@' +
                          account.userName
                        : '',

                    account.serviceCallId ||
                        '',

                    account.instanceUrl ||
                        ''
                ]
                .filter(Boolean)
                .join(' · ');


                const role =
                    getAccountRoleLabel(
                        account
                    );


                /*
                 * ACCOUNT NAME
                 */

                const nameElement =
                    document.createElement(
                        'div'
                    );

                nameElement.className =
                    'saved-account-name';

                nameElement.textContent =
                    name;


                /*
                 * ACCOUNT DETAILS
                 */

                const detailsElement =
                    document.createElement(
                        'div'
                    );

                detailsElement.className =
                    'saved-account-details';

                detailsElement.textContent =
                    details;


                /*
                 * ROLE
                 */

                const roleElement =
                    document.createElement(
                        'div'
                    );

                roleElement.className =
                    'saved-account-role';

                roleElement.textContent =
                    role;


                /*
                 * REMOVE BUTTON
                 */

                const removeButton =
                    document.createElement(
                        'button'
                    );

                removeButton.type =
                    'button';

                removeButton.className =
                    'saved-account-remove';

                removeButton.textContent =
                    'Remove';


                removeButton.addEventListener(
                    'click',
                    async (event) => {

                        /*
                         * Do not activate the account
                         * when Remove is clicked.
                         */
                        event.stopPropagation();


                        const accountName =
                            account.name ||
                            account.userName ||
                            'this account';


                        const confirmed =
                            window.confirm(
                                'Remove ' +
                                accountName +
                                ' from ServiceCall Desktop?\n\n' +
                                'This only removes the saved sign-in from this device. ' +
                                'It does not delete the ServiceNow user.'
                            );


                        if (!confirmed) {

                            return;
                        }


                        removeButton.disabled =
                            true;


                        try {

                            const result =
                                await window.serviceCall
                                    .removeSavedAccount(
                                        account.accountKey
                                    );


                            if (
                                !result ||
                                result.success !== true
                            ) {

                                throw new Error(
                                    result?.message ||
                                    'Unable to remove account.'
                                );
                            }


                            await showAccountChooser();

                        } catch (error) {

                            console.error(
                                'Unable to remove saved account:',
                                error
                            );


                            if (
                                accountChooserMessage
                            ) {

                                accountChooserMessage
                                    .textContent =
                                    error?.message ||
                                    'Unable to remove account.';
                            }

                        } finally {

                            removeButton.disabled =
                                false;
                        }
                    }
                );


                /*
                 * BUILD ACCOUNT CARD
                 */

                button.appendChild(
                    nameElement
                );

                button.appendChild(
                    detailsElement
                );

                button.appendChild(
                    roleElement
                );

                button.appendChild(
                    removeButton
                );


                /*
                 * ACTIVATE SAVED ACCOUNT
                 */

                button.addEventListener(
                    'click',
                    async () => {

                        try {

                            if (
                                accountChooserMessage
                            ) {

                                accountChooserMessage
                                    .textContent =
                                    'Connecting to ' +
                                    (
                                        account.name ||
                                        account.userName ||
                                        'ServiceCall'
                                    ) +
                                    '...';
                            }


                            button.disabled =
                                true;


                            const result =
                                await window.serviceCall
                                    .activateSavedAccount(
                                        account.accountKey
                                    );


                            /*
                             * ACCOUNT AUTHORIZED
                             */

                            if (
                                result?.success === true &&
                                result.state ===
                                    'ready'
                            ) {

                                window.location.href =
                                    '../index.html';


                                return;
                            }


                            /*
                             * AUTHENTICATED BUT
                             * SERVICECALL ROLE MISSING
                             */

                            if (
                                result?.success === true &&
                                result.state ===
                                    'access_denied'
                            ) {

                                const identity =
                                    result?.user?.name ||
                                    result?.user?.user_name ||
                                    'This account';


                                showAccessDenied(
                                    identity +
                                    ' does not currently have ServiceCall access.'
                                );


                                return;
                            }


                            /*
                             * SAVED AUTHORIZATION CAN
                             * NO LONGER BE RESTORED
                             */

                            if (
                                result?.state ===
                                    'login_required'
                            ) {

                                showLogin();


                                if (authMessage) {

                                    authMessage.textContent =
                                        'Please sign in again to continue with this account.';
                                }


                                return;
                            }


                            throw new Error(
                                result?.message ||
                                'Unable to activate this account.'
                            );

                        } catch (error) {

                            console.error(
                                'Saved account activation failed:',
                                error
                            );


                            if (
                                accountChooserMessage
                            ) {

                                accountChooserMessage
                                    .textContent =
                                    error?.message ||
                                    'Unable to open this account.';
                            }

                        } finally {

                            button.disabled =
                                false;
                        }
                    }
                );


                savedAccountsContainer
                    .appendChild(
                        button
                    );
            }
        );
    }


   /*
 * Account scrolling replaces the old
 * View All / Show Recent behavior.
 */
if (viewAllAccountsButton) {

    viewAllAccountsButton.classList.add(
        'hidden'
    );
}
}


/*
 * -----------------------------------------
 * SHOW ACCOUNT CHOOSER
 * -----------------------------------------
 */

async function showAccountChooser() {

    stopAccessCheckPolling();


    showView(
        accountChooserView
    );


    if (accountChooserMessage) {

        accountChooserMessage.textContent =
            'Loading accounts...';
    }


    try {

        const result =
            await window.serviceCall
                .getSavedAccounts();


        if (
            !result ||
            result.success !== true
        ) {

            throw new Error(
                result?.message ||
                'Unable to load accounts.'
            );
        }


        savedAccounts =
            Array.isArray(
                result.accounts
            )
                ? result.accounts
                : [];


        showAllAccounts =
            false;


        if (accountSearchInput) {

            accountSearchInput.value =
                '';
        }


        renderSavedAccounts();


        if (accountChooserMessage) {

            accountChooserMessage.textContent =
                savedAccounts.length
                    ? ''
                    : 'No saved accounts yet.';
        }

    } catch (error) {

        console.error(
            'Unable to display saved accounts:',
            error
        );


        if (accountChooserMessage) {

            accountChooserMessage.textContent =
                error?.message ||
                'Unable to load accounts.';
        }
    }
}


/*
 * -----------------------------------------
 * ERROR VIEW
 * -----------------------------------------
 */

function showError(
    message
) {

    stopAccessCheckPolling();


    showView(
        errorView
    );


    if (errorMessage) {

        errorMessage.textContent =
            message ||
            'ServiceCall could not connect to ServiceNow.';
    }
}


/*
 * -----------------------------------------
 * MANUAL ACCESS CHECK
 * -----------------------------------------
 */

checkAccessButton?.addEventListener(
    'click',
    async () => {

        /*
         * Do not overlap with the automatic
         * authorization request.
         */
        if (accessCheckInProgress) {

            return;
        }


        accessCheckInProgress =
            true;


        try {

            checkAccessButton.disabled =
                true;

            checkAccessButton.textContent =
                'Checking access...';


            if (accessDeniedUser) {

                accessDeniedUser.textContent =
                    'Checking your ServiceCall access...';
            }


            const result =
                await window.serviceCall
                    .checkAccess();


            console.log(
                'ServiceCall access check:',
                result
            );


            /*
             * STILL DENIED
             */

            if (
                result?.state ===
                'access_denied'
            ) {

                if (accessDeniedUser) {

                    accessDeniedUser.textContent =
                        'Waiting for ServiceCall access...';
                }


                return;
            }


            /*
             * ACCESS NOW GRANTED
             */

            if (
                result?.state ===
                'ready'
            ) {

                stopAccessCheckPolling();


                if (accessDeniedUser) {

                    accessDeniedUser.textContent =
                        'ServiceCall access assigned. Signing you in...';
                }


                checkAccessButton.textContent =
                    'Access assigned';


                /*
                 * Match the automatic flow so
                 * both paths feel identical.
                 */
                await new Promise(
                    (resolve) => {

                        setTimeout(
                            resolve,
                            3500
                        );
                    }
                );


                window.location.href =
                    '../index.html';


                return;
            }


            /*
             * SESSION NO LONGER VALID
             */

            if (
                result?.state ===
                'login_required'
            ) {

                stopAccessCheckPolling();


                showLogin();


                if (authMessage) {

                    authMessage.textContent =
                        'Please sign in again.';
                }


                return;
            }


            throw new Error(
                result?.message ||
                'Unable to verify ServiceCall access.'
            );

        } catch (error) {

            console.error(
                'ServiceCall access check failed:',
                error
            );


            showError(
                error?.message ||
                'Unable to check ServiceCall access.'
            );

        } finally {

            accessCheckInProgress =
                false;


            /*
             * Only restore the button when
             * this view is still active.
             */
            if (
                accessDeniedView &&
                !accessDeniedView.classList.contains(
                    'hidden'
                )
            ) {

                checkAccessButton.disabled =
                    false;

                checkAccessButton.textContent =
                    'Check access again';
            }
        }
    }
);


/*
 * -----------------------------------------
 * CONNECT BUTTON
 * -----------------------------------------
 */

connectButton?.addEventListener(
    'click',
    async () => {

        const instanceUrl =
            String(
                instanceInput?.value ||
                ''
            ).trim();


        if (!instanceUrl) {

            if (authMessage) {

                authMessage.textContent =
                    'Enter your ServiceNow instance.';
            }


            return;
        }


        if (!window.serviceCall) {

            showError(
                'ServiceCall Desktop could not initialize.'
            );


            return;
        }


        try {

            connectButton.disabled =
                true;


            if (authMessage) {

                authMessage.textContent =
                    '';
            }


            /*
             * SAVE INSTANCE
             */

            const saveResult =
                await window.serviceCall
                    .saveInstance(
                        instanceUrl
                    );


            if (
                saveResult &&
                saveResult.success === false
            ) {

                throw new Error(
                    saveResult.message ||
                    'Unable to save the ServiceNow instance.'
                );
            }


            /*
             * SHOW AUTHENTICATING SCREEN
             */

            showAuthenticating();


            /*
             * START EXISTING OAUTH FLOW
             */

            const loginResult =
                await window.serviceCall
                    .startLogin();


            if (
                loginResult &&
                loginResult.success === false
            ) {

                throw new Error(
                    loginResult.message ||
                    'Unable to start ServiceNow authentication.'
                );
            }

        } catch (error) {

            console.error(
                'ServiceCall login failed:',
                error
            );


            connectButton.disabled =
                false;


            showError(
                error?.message ||
                'Unable to start ServiceNow authentication.'
            );
        }
    }
);


/*
 * -----------------------------------------
 * ENTER KEY
 * -----------------------------------------
 */

instanceInput?.addEventListener(
    'keydown',
    (event) => {

        if (
            event.key ===
            'Enter'
        ) {

            connectButton?.click();
        }
    }
);


/*
 * -----------------------------------------
 * RETRY
 * -----------------------------------------
 */

retryButton?.addEventListener(
    'click',
    () => {

        showLogin();
    }
);


/*
 * -----------------------------------------
 * OAUTH STATUS
 * -----------------------------------------
 */

if (
    window.serviceCall &&
    typeof window.serviceCall.onAuthStatus ===
        'function'
) {

    window.serviceCall.onAuthStatus(
        async (status) => {

            console.log(
                'ServiceCall auth status:',
                status
            );


            if (
                status?.status ===
                'authenticating'
            ) {

                showAuthenticating();


                return;
            }


            if (
                status?.status ===
                'connected'
            ) {

                /*
                 * OAuth succeeded.
                 *
                 * Main process performs
                 * /me authorization next.
                 */

                if (authMessage) {

                    authMessage.textContent =
                        '';
                }


                return;
            }


            if (
                status?.status ===
                'access_denied'
            ) {

                connectButton.disabled =
                    false;


                showAccessDenied(
                    status?.message
                );


                return;
            }


            if (
                status?.status ===
                'error'
            ) {

                connectButton.disabled =
                    false;


                showError(
                    status?.message ||
                    'ServiceNow authentication failed.'
                );
            }
        }
    );
}


/*
 * -----------------------------------------
 * ACCOUNT SEARCH
 * -----------------------------------------
 */

accountSearchInput?.addEventListener(
    'input',
    () => {

        renderSavedAccounts();
    }
);


/*
 * -----------------------------------------
 * VIEW ALL ACCOUNTS
 * -----------------------------------------
 */

viewAllAccountsButton?.addEventListener(
    'click',
    () => {

        showAllAccounts =
            !showAllAccounts;


        renderSavedAccounts();
    }
);

/*
 * -----------------------------------------
 * BACK TO SAVED ACCOUNTS
 * -----------------------------------------
 */

backToAccountsButton?.addEventListener(
    'click',
    async () => {

        try {

            await showAccountChooser();

        } catch (error) {

            console.error(
                'Unable to return to saved accounts:',
                error
            );
        }
    }
);
/*
 * -----------------------------------------
 * ADD ACCOUNT
 * -----------------------------------------
 */

addAccountButton?.addEventListener(
    'click',
    () => {

        showLogin();
    }
);


/*
 * -----------------------------------------
 * INITIALIZE AUTH GATE
 * -----------------------------------------
 */

(async function initializeAuthGate() {

    try {

        const result =
            await window.serviceCall
                .getSavedAccounts();


        if (
            result?.success === true &&
            Array.isArray(
                result.accounts
            ) &&
            result.accounts.length > 0
        ) {

            await showAccountChooser();


            return;
        }

    } catch (error) {

        console.error(
            'Unable to initialize account chooser:',
            error
        );
    }


    showLogin();

})();