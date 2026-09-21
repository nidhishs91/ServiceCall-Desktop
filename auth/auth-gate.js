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

const useAnotherAccountButton =
    document.getElementById(
        'useAnotherAccountButton'
    );

useAnotherAccountButton?.addEventListener(
    'click',
    async () => {

        try {

            /*
             * Return to the account chooser.
             *
             * Existing saved accounts remain
             * available and + Add User can be
             * used for a completely new login.
             */
            await showAccountChooser();

        } catch (error) {

            console.error(
                'Unable to open account chooser:',
                error
            );


            /*
             * Safe fallback:
             * if the chooser cannot load,
             * return to the normal login view.
             */
            showLogin();

            if (authMessage) {

                authMessage.textContent =
                    'You can sign in with another ServiceNow account.';
            }
        }
    }
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

    showView(
        loginView
    );

    if (authMessage) {
        authMessage.textContent = '';
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

    showView(
        authenticatingView
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
            'Required ServiceCall access has not been assigned.';
    }
}

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


    let filteredAccounts =
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
     * When searching, always show every
     * matching account.
     *
     * Otherwise show only the five most
     * recently used accounts.
     */
    const accountsToRender =
        searchText ||
        showAllAccounts
            ? filteredAccounts
            : filteredAccounts.slice(
                0,
                5
            );


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
                 * textContent is used instead
                 * of inserting account data
                 * through HTML.
                 */
                const nameElement =
                    document.createElement(
                        'div'
                    );

                nameElement.className =
                    'saved-account-name';

                nameElement.textContent =
                    name;


                const detailsElement =
                    document.createElement(
                        'div'
                    );

                detailsElement.className =
                    'saved-account-details';

                detailsElement.textContent =
                    details;


                const roleElement =
                    document.createElement(
                        'div'
                    );

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
         * Don't trigger account activation
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


            /*
             * Reload the chooser from the
             * main process.
             */
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

                roleElement.className =
                    'saved-account-role';

                roleElement.textContent =
                    role;


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
                result.state === 'ready'
            ) {

                window.location.href =
                    '../index.html';

                return;
            }


            /*
             * ACCOUNT AUTHENTICATED,
             * BUT SERVICECALL ROLE MISSING
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
             * SAVED AUTHORIZATION CAN NO
             * LONGER BE RESTORED.
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


    if (viewAllAccountsButton) {

        const needsViewAll =
            !searchText &&
            savedAccounts.length > 5;


        viewAllAccountsButton
            .classList.toggle(
                'hidden',
                !needsViewAll
            );


        viewAllAccountsButton.textContent =
            showAllAccounts
                ? 'Show recent accounts'
                : 'View all accounts (' +
                  savedAccounts.length +
                  ')';
    }
}


async function showAccountChooser() {

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

function showError(message) {

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
 * CONNECT BUTTON
 * -----------------------------------------
 */

checkAccessButton?.addEventListener(
    'click',
    async () => {

        try {

            checkAccessButton.disabled =
                true;

            checkAccessButton.textContent =
                'Checking access...';


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

                showAccessDenied(
                    'ServiceCall access has still not been assigned to this account.'
                );

                return;
            }


            /*
             * ACCESS NOW GRANTED
             */

            if (
                result?.state ===
                'ready'
            ) {

                /*
                 * Background services have
                 * already been started by
                 * the main process.
                 */

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

        }
        catch (error) {

            console.error(
                'ServiceCall access check failed:',
                error
            );

            showError(
                error?.message ||
                'Unable to check ServiceCall access.'
            );
        }
        finally {

            checkAccessButton.disabled =
                false;

            checkAccessButton.textContent =
                'Check access again';
        }
    }
);

connectButton?.addEventListener(
    'click',
    async () => {

        const instanceUrl =
            String(
                instanceInput?.value || ''
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

            connectButton.disabled = true;

            if (authMessage) {
                authMessage.textContent = '';
            }


            /*
             * SAVE INSTANCE
             */

            const saveResult =
                await window.serviceCall.saveInstance(
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
                await window.serviceCall.startLogin();


            if (
                loginResult &&
                loginResult.success === false
            ) {
                throw new Error(
                    loginResult.message ||
                    'Unable to start ServiceNow authentication.'
                );
            }

        }
        catch (error) {

            console.error(
                'ServiceCall login failed:',
                error
            );

            connectButton.disabled = false;

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
            event.key === 'Enter'
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
 * INITIAL STATE
 * -----------------------------------------
 */

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
                 * Main process will perform
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

accountSearchInput?.addEventListener(
    'input',
    () => {

        renderSavedAccounts();

    }
);


viewAllAccountsButton?.addEventListener(
    'click',
    () => {

        showAllAccounts =
            !showAllAccounts;

        renderSavedAccounts();

    }
);


addAccountButton?.addEventListener(
    'click',
    () => {

        showLogin();

    }
);

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