const {
    app,
    BrowserWindow,
    ipcMain,
    shell,
    Tray,
    Menu
} = require('electron');

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const os = require('os');

let mainWindow = null;
let callbackServer = null;
let heartbeatTimer = null;
let tray = null;
let isQuitting = false;
let incomingCallTimer = null;
let activeIncomingCallId = null;
let outgoingCallTimer = null;
let activeOutgoingCallId = null;
let activeCallWindowId = null;
let callWindowClosing = false;

const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 42813;
const SERVICECALL_PROTOCOL = 'servicecall';


/* -------------------------------------------------------
   CONFIG
------------------------------------------------------- */

function getConfigPath() {

    return path.join(
        app.getPath('userData'),
        'servicecall-config.json'
    );
}


function saveConfig(config) {

    fs.writeFileSync(
        getConfigPath(),
        JSON.stringify(
            config,
            null,
            2
        ),
        'utf8'
    );
}


function loadConfig() {

    const configPath =
        getConfigPath();

    if (!fs.existsSync(configPath)) {
        return {};
    }

    return JSON.parse(
        fs.readFileSync(
            configPath,
            'utf8'
        )
    );
}

function getOrCreateDeviceId() {

    const config =
        loadConfig();

    if (config.deviceId) {
        return config.deviceId;
    }

    const deviceId =
        crypto.randomUUID();

    config.deviceId =
        deviceId;

    saveConfig(config);

    return deviceId;
}

async function sendHeartbeatOnce() {

    const config =
        loadConfig();

    if (!config.instanceUrl) {
        throw new Error(
            'ServiceNow instance is not configured.'
        );
    }

    if (!config.accessToken) {
        throw new Error(
            'ServiceNow access token was not found.'
        );
    }

    const heartbeatUrl =
        config.instanceUrl +
        config.heartbeatPath;

    const payload = {
        device_id:
            getOrCreateDeviceId(),

        device_name:
            os.hostname(),

        platform:
            process.platform === 'win32'
                ? 'Windows'
                : process.platform,

        app_version:
            app.getVersion()
    };

    const response =
        await fetch(
            heartbeatUrl,
            {
                method: 'POST',

                headers: {
                    'Authorization':
                        'Bearer ' +
                        config.accessToken,

                    'Content-Type':
                        'application/json',

                    'Accept':
                        'application/json'
                },

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );

    const responseText =
        await response.text();

    let data;

    try {

        data =
            JSON.parse(
                responseText
            );

    } catch (error) {

        throw new Error(
            'Heartbeat API returned an invalid response.'
        );
    }

    if (!response.ok) {

    console.error(
        'Heartbeat HTTP status:',
        response.status
    );

    console.error(
        'Heartbeat response:',
        JSON.stringify(
            data,
            null,
            2
        )
    );

    if (
    response.status === 401 ||
    response.status === 403
) {

    const authError =
        new Error(
            'Your ServiceNow session has expired. Please sign in again.'
        );

    authError.code =
        'AUTHENTICATION_REQUIRED';

    throw authError;
}

    var errorMessage =
        'Heartbeat failed with HTTP ' +
        response.status;

    if (
        data &&
        typeof data.error === 'object' &&
        data.error
    ) {

        errorMessage =
            data.error.message ||
            data.error.detail ||
            errorMessage;

    } else if (
        data &&
        typeof data.error === 'string'
    ) {

        errorMessage =
            data.error;

    } else if (
        data &&
        typeof data.message === 'string'
    ) {

        errorMessage =
            data.message;
    }

    throw new Error(
        errorMessage
    );
}

    return data;
}

async function checkIncomingCallOnce() {

    const config = loadConfig();

    if (
        !config ||
        !config.instanceUrl ||
        !config.accessToken
    ) {
        return;
    }


    try {

        const url =
            config.instanceUrl.replace(/\/$/, '') +
            '/api/x_1806573_servic_0/servicecall_desktop_api/incoming-call';


        const response =
            await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        'Accept': 'application/json',

                        'Authorization':
                            'Bearer ' +
                            config.accessToken
                    }
                }
            );


        if (
            response.status === 401 ||
            response.status === 403
        ) {

            const error =
                new Error(
                    'Your ServiceNow session has expired. Please sign in again.'
                );

            error.code =
                'AUTHENTICATION_REQUIRED';

            throw error;
        }


        let data = {};

        try {

            data =
                await response.json();

        } catch (jsonError) {

            console.error(
                'Incoming call JSON parse error:',
                jsonError
            );

            return;
        }


        const result =
            data.result || data;


        if (!response.ok) {

            console.error(
                'Incoming call request failed:',
                result
            );

            return;
        }


        /*
         * Incoming ringing call found
         */
        if (
            result &&
            result.success &&
            result.incoming_call
        ) {

            const incomingCallId =
                result.call_sys_id;


            /*
             * Prevent the same incoming call
             * from reopening every polling cycle.
             */
            if (
                incomingCallId &&
                incomingCallId !==
                    activeIncomingCallId
            ) {

                activeIncomingCallId =
                    incomingCallId;


                console.log(
                    'Incoming ServiceCall:',
                    result
                );


                showCallWindow(
                    'incoming',
                    {
                        callSysId:
                            result.call_sys_id,

                        callNumber:
                            result.call_number,

                        name:
                            result.caller_name ||
                            'Unknown User',

                        department:
                            result.caller_department ||
                            ''
                    }
                );
            }


            return;
        }


        /*
         * No incoming ringing call currently exists.
         * Reset this so a future call can open.
         */
        activeIncomingCallId =
            null;

    } catch (error) {

        console.error(
            'Incoming call check failed:',
            error
        );


        if (
            error.code ===
            'AUTHENTICATION_REQUIRED'
        ) {

            stopIncomingCallLoop();


            if (
                mainWindow &&
                !mainWindow.isDestroyed()
            ) {

                mainWindow.webContents.send(
                    'servicecall-auth-status',
                    {
                        status:
                            'authentication_required',

                        message:
                            'Your ServiceNow session has expired. Please sign in again.'
                    }
                );
            }
        }
    }
}

function stopIncomingCallLoop() {

    if (incomingCallTimer) {

        clearInterval(
            incomingCallTimer
        );

        incomingCallTimer =
            null;
    }
}

function stopHeartbeatLoop() {

    if (heartbeatTimer) {

        clearInterval(
            heartbeatTimer
        );

        heartbeatTimer = null;
    }
}


async function startHeartbeatLoop() {

    stopHeartbeatLoop();

    try {

        const result =
            await sendHeartbeatOnce();

        console.log(
            'ServiceCall heartbeat:',
            result
        );

        sendAuthStatus(
            'connected',
            'ServiceCall Desktop is connected.'
        );

    } catch (error) {

        console.error(
            'Initial heartbeat failed:',
            error
        );

        if (
            error.code ===
            'AUTHENTICATION_REQUIRED'
        ) {

            stopHeartbeatLoop();

            sendAuthStatus(
                'authentication_required',
                'Your ServiceNow session has expired. Please sign in again.'
            );

            return;
        }

        sendAuthStatus(
            'warning',
            'ServiceCall Desktop heartbeat failed: ' +
            error.message
        );

        return;
    }

    heartbeatTimer =
        setInterval(
            async () => {

                try {

                    const result =
                        await sendHeartbeatOnce();

                    console.log(
                        'ServiceCall heartbeat:',
                        result
                    );

                } catch (error) {

                    console.error(
                        'Heartbeat failed:',
                        error
                    );

                    if (
                        error.code ===
                        'AUTHENTICATION_REQUIRED'
                    ) {

                        stopHeartbeatLoop();

                        sendAuthStatus(
                            'authentication_required',
                            'Your ServiceNow session has expired. Please sign in again.'
                        );

                        return;
                    }

                    sendAuthStatus(
                        'warning',
                        'ServiceCall Desktop heartbeat failed: ' +
                        error.message
                    );
                }

            },
            30000
        );
}

function startIncomingCallLoop() {

    stopIncomingCallLoop();

    checkIncomingCallOnce();

    incomingCallTimer =
        setInterval(
            checkIncomingCallOnce,
            3000
        );
}

async function restoreSavedConnection() {

    const config =
        loadConfig();

    if (
        !config.instanceUrl ||
        !config.accessToken
    ) {

        console.log(
            'No saved ServiceCall connection found.'
        );

        return;
    }


    console.log(
        'Saved ServiceCall connection found. Restoring...'
    );


    try {

        await startHeartbeatLoop();

        startIncomingCallLoop();

        startOutgoingCallLoop();


        console.log(
            'ServiceCall connection restored.'
        );

    } catch (error) {

        console.error(
            'Unable to restore ServiceCall connection:',
            error
        );


        sendAuthStatus(
            'warning',
            'Saved ServiceNow connection could not be restored: ' +
            error.message
        );
    }
}

/* -------------------------------------------------------
   INSTANCE URL
------------------------------------------------------- */

function normalizeInstanceUrl(value) {

    if (!value) {
        return '';
    }

    value =
        value.trim();

    if (
        !value.startsWith(
            'https://'
        )
    ) {
        value =
            'https://' + value;
    }

    value =
        value.replace(
            /\/+$/,
            ''
        );

    return value;
}


function isValidServiceNowUrl(value) {

    try {

        const parsed =
            new URL(value);

        return (
            parsed.protocol === 'https:' &&
            parsed.hostname.endsWith(
                '.service-now.com'
            )
        );

    } catch (error) {

        return false;
    }
}


/* -------------------------------------------------------
   PKCE
------------------------------------------------------- */

function base64UrlEncode(buffer) {

    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


function generateCodeVerifier() {

    return base64UrlEncode(
        crypto.randomBytes(64)
    );
}


function generateCodeChallenge(
    verifier
) {

    const hash =
        crypto
            .createHash('sha256')
            .update(verifier)
            .digest();

    return base64UrlEncode(
        hash
    );
}


function generateState() {

    return base64UrlEncode(
        crypto.randomBytes(32)
    );
}


/* -------------------------------------------------------
   SEND STATUS TO DESKTOP WINDOW
------------------------------------------------------- */

function sendAuthStatus(
    status,
    message
) {

    if (
        mainWindow &&
        !mainWindow.isDestroyed()
    ) {

        mainWindow.webContents.send(
            'servicecall-auth-status',
            {
                status: status,
                message: message
            }
        );
    }
}


/* -------------------------------------------------------
   TOKEN EXCHANGE
------------------------------------------------------- */

async function exchangeAuthorizationCode(
    code,
    returnedState
) {

    const config =
        loadConfig();

    if (
        !config.oauthState ||
        returnedState !==
            config.oauthState
    ) {

        throw new Error(
            'OAuth state validation failed.'
        );
    }

    if (
        !config.pkceCodeVerifier
    ) {

        throw new Error(
            'PKCE code verifier was not found.'
        );
    }

    const tokenUrl =
        config.instanceUrl +
        '/oauth_token.do';

    const body =
        new URLSearchParams();

    body.set(
        'grant_type',
        'authorization_code'
    );

    body.set(
        'code',
        code
    );

    body.set(
        'redirect_uri',
        config.redirectUri
    );

    body.set(
        'client_id',
        config.oauthClientId
    );

    body.set(
        'code_verifier',
        config.pkceCodeVerifier
    );

    body.set(
        'state',
        returnedState
    );

    const response =
        await fetch(
            tokenUrl,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/x-www-form-urlencoded'
                },

                body:
                    body.toString()
            }
        );

    const responseText =
        await response.text();

    let tokenData;

    try {

        tokenData =
            JSON.parse(
                responseText
            );

    } catch (error) {

        throw new Error(
            'ServiceNow returned an invalid token response.'
        );
    }

    if (
        !response.ok ||
        !tokenData.access_token
    ) {

        throw new Error(
            tokenData.error_description ||
            tokenData.error ||
            'Unable to obtain OAuth access token.'
        );
    }

    config.accessToken =
        tokenData.access_token;

    config.tokenType =
        tokenData.token_type ||
        'Bearer';

    config.expiresIn =
        tokenData.expires_in || 0;

    config.tokenObtainedAt =
        Date.now();

    /*
       We no longer need these after
       successful authentication.
    */

    delete config.pkceCodeVerifier;
delete config.oauthState;

saveConfig(config);

await startHeartbeatLoop();

startIncomingCallLoop();
startOutgoingCallLoop();
return tokenData;
}


/* -------------------------------------------------------
   LOCAL OAUTH CALLBACK SERVER
------------------------------------------------------- */

function stopCallbackServer() {

    if (callbackServer) {

        try {
            callbackServer.close();
        } catch (error) {
            // Ignore shutdown errors.
        }

        callbackServer = null;
    }
}


function startCallbackServer() {

    return new Promise(
        (resolve, reject) => {

            stopCallbackServer();

            callbackServer =
                http.createServer(
                    async (
                        request,
                        response
                    ) => {

                        try {

                            const callbackUrl =
                                new URL(
                                    request.url,
                                    `http://${CALLBACK_HOST}:${CALLBACK_PORT}`
                                );

                            if (
                                callbackUrl.pathname !==
                                '/callback'
                            ) {

                                response.writeHead(
                                    404,
                                    {
                                        'Content-Type':
                                            'text/plain'
                                    }
                                );

                                response.end(
                                    'Not found.'
                                );

                                return;
                            }

                            const oauthError =
                                callbackUrl
                                    .searchParams
                                    .get(
                                        'error'
                                    );

                            if (oauthError) {

                                const description =
                                    callbackUrl
                                        .searchParams
                                        .get(
                                            'error_description'
                                        ) ||
                                    oauthError;

                                response.writeHead(
                                    400,
                                    {
                                        'Content-Type':
                                            'text/html; charset=utf-8'
                                    }
                                );

                                response.end(`
                                    <html>
                                        <body style="
                                            font-family: Arial, sans-serif;
                                            text-align: center;
                                            padding-top: 80px;
                                        ">
                                            <h2>ServiceCall authorization was not completed.</h2>
                                            <p>You can close this browser window.</p>
                                        </body>
                                    </html>
                                `);

                                sendAuthStatus(
                                    'error',
                                    description
                                );

                                stopCallbackServer();

                                return;
                            }

                            const code =
                                callbackUrl
                                    .searchParams
                                    .get(
                                        'code'
                                    );

                            const state =
                                callbackUrl
                                    .searchParams
                                    .get(
                                        'state'
                                    );

                            if (
                                !code ||
                                !state
                            ) {

                                throw new Error(
                                    'Authorization code or state was missing.'
                                );
                            }

                            await exchangeAuthorizationCode(
                                code,
                                state
                            );

                            response.writeHead(
                                200,
                                {
                                    'Content-Type':
                                        'text/html; charset=utf-8'
                                }
                            );

                            response.end(`
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <title>ServiceCall Desktop</title>
                                </head>

                                <body style="
                                    margin: 0;
                                    background: #f3f7f6;
                                    font-family: Arial, sans-serif;
                                    color: #1f2d2a;
                                ">

                                    <div style="
                                        max-width: 520px;
                                        margin: 100px auto;
                                        padding: 40px;
                                        background: white;
                                        border-radius: 12px;
                                        text-align: center;
                                        box-shadow: 0 8px 28px rgba(0,0,0,0.08);
                                    ">

                                        <h1 style="
                                            margin-bottom: 12px;
                                        ">
                                            ServiceCall Desktop
                                        </h1>

                                        <h2 style="
                                            color: #0b6b58;
                                        ">
                                            Connected successfully
                                        </h2>

                                        <p>
                                            Your ServiceNow account is now connected
                                            to ServiceCall Desktop.
                                        </p>

                                        <p>
                                            You can close this browser window
                                            and return to ServiceCall Desktop.
                                        </p>

                                    </div>

                                </body>
                                </html>
                            `);

                            sendAuthStatus(
                                'connected',
                                'ServiceNow sign-in completed successfully.'
                            );

                            if (
                                mainWindow &&
                                !mainWindow.isDestroyed()
                            ) {

                                mainWindow.show();
                                mainWindow.focus();
                            }

                            setTimeout(
                                stopCallbackServer,
                                1000
                            );

                        } catch (error) {

                            response.writeHead(
                                500,
                                {
                                    'Content-Type':
                                        'text/html; charset=utf-8'
                                }
                            );

                            response.end(`
                                <html>
                                    <body style="
                                        font-family: Arial, sans-serif;
                                        text-align: center;
                                        padding-top: 80px;
                                    ">
                                        <h2>ServiceCall connection failed.</h2>
                                        <p>
                                            Return to ServiceCall Desktop
                                            and try again.
                                        </p>
                                    </body>
                                </html>
                            `);

                            sendAuthStatus(
                                'error',
                                error.message
                            );

                            stopCallbackServer();
                        }
                    }
                );

            callbackServer.on(
                'error',
                (error) => {

                    callbackServer =
                        null;

                    reject(error);
                }
            );

            callbackServer.listen(
                CALLBACK_PORT,
                CALLBACK_HOST,
                () => {

                    resolve();
                }
            );
        }
    );
}


/* -------------------------------------------------------
   WINDOW
------------------------------------------------------- */

function registerServiceCallProtocol() {

    if (process.defaultApp) {

        if (
            process.argv.length >= 2
        ) {

            app.setAsDefaultProtocolClient(
                SERVICECALL_PROTOCOL,
                process.execPath,
                [
                    path.resolve(
                        process.argv[1]
                    )
                ]
            );
        }

    } else {

        app.setAsDefaultProtocolClient(
            SERVICECALL_PROTOCOL
        );
    }
}

function showMainWindow() {

    if (
        mainWindow &&
        !mainWindow.isDestroyed()
    ) {

        if (
            mainWindow.isMinimized()
        ) {
            mainWindow.restore();
        }

        mainWindow.show();
        mainWindow.focus();

        return;
    }

    createWindow();
}

function createWindow() {

    mainWindow =
        new BrowserWindow({
            width: 900,
            height: 650,

            minWidth: 700,
            minHeight: 500,

            title:
                'ServiceCall Desktop',

            webPreferences: {

                preload:
                    path.join(
                        __dirname,
                        'preload.js'
                    ),

                contextIsolation:
                    true,

                nodeIntegration:
                    false
            }
        });

    mainWindow.loadFile(
        'index.html'
    );

    mainWindow.on(
    'close',
    (event) => {

        if (!isQuitting) {

            event.preventDefault();

            mainWindow.hide();
        }
    }
);
}

function createTray() {

    if (tray) {
        return;
    }

    /*
       Temporary tray icon:
       Electron will use the app icon later.
       For now we can create the tray only
       after we add a proper icon file.
    */

    const trayMenu =
        Menu.buildFromTemplate([
            {
                label: 'Open ServiceCall',
                click: () => {

                    if (
                        mainWindow &&
                        !mainWindow.isDestroyed()
                    ) {

                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },

            {
                type: 'separator'
            },

            {
                label: 'Quit ServiceCall',
                click: () => {

                    isQuitting = true;

                    stopHeartbeatLoop();
                    stopCallbackServer();

                    app.quit();
                }
            }
        ]);

    return trayMenu;
}

/* -------------------------------------------------------
   SAVE INSTANCE
------------------------------------------------------- */

ipcMain.handle(
    'servicecall-get-connection-status',

    async () => {

        const config =
            loadConfig();

        if (
            config.instanceUrl &&
            config.accessToken &&
            heartbeatTimer
        ) {

            return {
                connected: true,

                message:
                    'ServiceCall Desktop is connected.'
            };
        }

        return {
            connected: false,

            message:
                'Sign in to ServiceNow to connect ServiceCall Desktop.'
        };
    }
);

ipcMain.handle(
    'servicecall-save-instance',

    async (
        event,
        instanceUrl
    ) => {

        const normalizedUrl =
            normalizeInstanceUrl(
                instanceUrl
            );

        if (
            !isValidServiceNowUrl(
                normalizedUrl
            )
        ) {

            return {
                success: false,

                message:
                    'Please enter a valid ServiceNow instance URL, for example https://dev12345.service-now.com'
            };
        }

        const config =
            loadConfig();

        config.instanceUrl =
    normalizedUrl;

const configUrl =
    normalizedUrl +
    '/api/x_1806573_servic_0/servicecall_desktop_api/config';

const configResponse =
    await fetch(
        configUrl,
        {
            method: 'GET',

            headers: {
                'Accept':
                    'application/json'
            }
        }
    );

const configText =
    await configResponse.text();

let serviceCallConfig;

try {

    serviceCallConfig =
        JSON.parse(
            configText
        );

} catch (error) {

    return {
        success: false,
        message:
            'The ServiceNow instance returned an invalid ServiceCall configuration.'
    };
}

const result =
    serviceCallConfig.result ||
    serviceCallConfig;

if (
    !configResponse.ok ||
    !result.success
) {

    return {
        success: false,
        message:
            result.message ||
            'Unable to retrieve ServiceCall configuration from this instance.'
    };
}

if (
    !result.oauth_client_id ||
    !result.redirect_uri ||
    !result.oauth_scope ||
    !result.heartbeat_path
) {

    return {
        success: false,
        message:
            'ServiceCall Desktop is not fully configured on this ServiceNow instance.'
    };
}

config.oauthClientId =
    result.oauth_client_id;

config.redirectUri =
    result.redirect_uri;

config.oauthScope =
    result.oauth_scope;

config.heartbeatPath =
    result.heartbeat_path;

        saveConfig(config);

        return {
            success: true,

            message:
                'ServiceNow instance saved successfully.',

            instanceUrl:
                normalizedUrl
        };
    }
);


/* -------------------------------------------------------
   GET INSTANCE
------------------------------------------------------- */

ipcMain.handle(
    'servicecall-get-instance',

    async () => {

        const config =
            loadConfig();

        return {
            success: true,

            instanceUrl:
                config.instanceUrl ||
                ''
        };
    }
);


/* -------------------------------------------------------
   START OAUTH LOGIN
------------------------------------------------------- */

ipcMain.handle(
    'servicecall-start-login',

    async () => {

        try {

            const config =
                loadConfig();

            if (
                !config.instanceUrl ||
                !config.oauthClientId
            ) {

                return {
                    success: false,

                    message:
                        'Please save your ServiceNow instance first.'
                };
            }

            /*
               Start localhost listener BEFORE
               opening the browser.
            */

            await startCallbackServer();

            const codeVerifier =
                generateCodeVerifier();

            const codeChallenge =
                generateCodeChallenge(
                    codeVerifier
                );

            const state =
                generateState();

            config.pkceCodeVerifier =
                codeVerifier;

            config.oauthState =
                state;

            saveConfig(config);

            const authorizeUrl =
                new URL(
                    config.instanceUrl +
                    '/oauth_auth.do'
                );

            authorizeUrl
                .searchParams
                .set(
                    'response_type',
                    'code'
                );

            authorizeUrl
                .searchParams
                .set(
                    'client_id',
                    config.oauthClientId
                );

            authorizeUrl
                .searchParams
                .set(
                    'redirect_uri',
                    config.redirectUri
                );

            authorizeUrl
                .searchParams
                .set(
                    'scope',
                    config.oauthScope
                );

            authorizeUrl
                .searchParams
                .set(
                    'code_challenge',
                    codeChallenge
                );

            authorizeUrl
                .searchParams
                .set(
                    'code_challenge_method',
                    'S256'
                );

            authorizeUrl
                .searchParams
                .set(
                    'state',
                    state
                );

            await shell.openExternal(
                authorizeUrl.toString()
            );

            return {
                success: true,

                message:
                    'ServiceNow sign-in opened in your browser.'
            };

        } catch (error) {

            stopCallbackServer();

            return {
                success: false,

                message:
                    error.message
            };
        }
    }
);


/* -------------------------------------------------------
   APP START
------------------------------------------------------- */

const gotSingleInstanceLock =
    app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {

    app.quit();

} else {

    app.on(
        'second-instance',
        (
            event,
            commandLine
        ) => {

            const protocolUrl =
                commandLine.find(
                    function(arg) {

                        return arg.startsWith(
                            SERVICECALL_PROTOCOL +
                            '://'
                        );
                    }
                );

            if (protocolUrl) {

                console.log(
                    'ServiceCall protocol opened:',
                    protocolUrl
                );
            }

            showMainWindow();
        }
    );
}

app.whenReady().then(
    async () => {

        registerServiceCallProtocol();

        createWindow();

        await restoreSavedConnection();

        app.on(
            'activate',

            () => {

                if (
                    BrowserWindow
                        .getAllWindows()
                        .length === 0
                ) {

                    createWindow();
                }
            }
        );
    }
);

app.on(
    'window-all-closed',

    () => {

        // stopHeartbeatLoop();
        // stopCallbackServer();

        // if (
        //     process.platform !==
        //     'darwin'
        // ) {

        //     app.quit();
        // }
    }
);

app.on(
    'before-quit',
    () => {

        isQuitting = true;


        stopHeartbeatLoop();
        stopIncomingCallLoop();
        stopCallbackServer();
        stopOutgoingCallLoop();
    }
);

app.on(
    'open-url',
    (
        event,
        url
    ) => {

        event.preventDefault();

        console.log(
            'ServiceCall protocol opened:',
            url
        );

        showMainWindow();
    }
);

let callWindow = null;

function showCallWindow(
    mode,
    callData
) {

    const callSysId =
        callData.callSysId || '';


    /*
     * If this exact call window is already open,
     * simply bring it to the front.
     */
    if (
        callWindow &&
        !callWindow.isDestroyed() &&
        activeCallWindowId === callSysId
    ) {

        if (callWindow.isMinimized()) {
            callWindow.restore();
        }

        callWindow.show();
        callWindow.focus();

        return;
    }


    /*
     * Do not replace an existing active call
     * with another incoming/outgoing call.
     */
    if (
        callWindow &&
        !callWindow.isDestroyed() &&
        activeCallWindowId &&
        activeCallWindowId !== callSysId
    ) {

        console.log(
            'Another ServiceCall window is already active:',
            activeCallWindowId
        );

        return;
    }


    activeCallWindowId =
        callSysId;


    callWindow =
        new BrowserWindow({
            width: 440,
            height: 560,

            minWidth: 440,
            minHeight: 560,

            resizable: false,

            title:
                'ServiceCall',

            autoHideMenuBar:
                true,

            show:
                false,

            webPreferences: {

                preload:
                    path.join(
                        __dirname,
                        'preload.js'
                    ),

                contextIsolation:
                    true,

                nodeIntegration:
                    false
            }
        });


    callWindow.loadFile(
        'call-window.html',
        {
            query: {

                mode:
                    mode,

                callSysId:
                    callSysId,

                callNumber:
                    callData.callNumber ||
                    '',

                name:
                    callData.name ||
                    'Unknown User',

                department:
                    callData.department ||
                    ''
            }
        }
    );


    callWindow.once(
        'ready-to-show',
        () => {

            if (
                callWindow &&
                !callWindow.isDestroyed()
            ) {

                callWindow.show();
                callWindow.focus();
            }
        }
    );

    callWindow.on(
    'close',
    async (event) => {

        /*
         * Allow the window to actually close
         * after we finish our own handling.
         */
        if (callWindowClosing) {
            return;
        }


        event.preventDefault();


        /*
         * No call sys_id means there is nothing
         * to update in ServiceNow.
         */
        if (!callSysId) {

            callWindowClosing = true;

            callWindow.close();

            return;
        }


        try {

            const result =
                await serviceCallApiRequest(
                    '/call-status?call_sys_id=' +
                    encodeURIComponent(
                        callSysId
                    ),
                    'GET'
                );


            const state =
                result.state || '';


            /*
             * -------------------------------------------------
             * RINGING
             * -------------------------------------------------
             *
             * If I am the caller:
             * X = Cancel Call
             *
             * If I am the receiver:
             * X = Decline Call
             */
            if (state === 'ringing') {

                const participantStatus =
                    result.participant_status || '';


                if (
                    mode === 'calling'
                ) {

                    await serviceCallApiRequest(
                        '/cancel-call',
                        'POST',
                        {
                            call_sys_id:
                                callSysId
                        }
                    );

                } else {

                    /*
                     * Incoming receiver
                     */
                    await serviceCallApiRequest(
                        '/decline-call',
                        'POST',
                        {
                            call_sys_id:
                                callSysId
                        }
                    );
                }


                callWindowClosing = true;

                callWindow.close();

                return;
            }


            /*
             * -------------------------------------------------
             * CONNECTED
             * -------------------------------------------------
             *
             * X does NOT end the call.
             * It only hides the call window.
             */
            if (state === 'connected') {

                callWindow.hide();

                return;
            }


            /*
             * Terminal states:
             *
             * completed
             * cancelled
             * declined
             * failed
             */
            if (
                state === 'completed' ||
                state === 'cancelled' ||
                state === 'declined' ||
                state === 'failed'
            ) {

                callWindowClosing = true;

                callWindow.close();

                return;
            }


            /*
             * Unknown state:
             * safest behavior is just hide.
             */
            callWindow.hide();

        } catch (error) {

            console.error(
                'ServiceCall window close handling failed:',
                error
            );


            /*
             * If ServiceNow cannot be reached,
             * do NOT accidentally terminate a live call.
             */
            if (
                callWindow &&
                !callWindow.isDestroyed()
            ) {

                callWindow.hide();
            }
        }
    }
);

    callWindow.on(
    'closed',
    () => {

        callWindow =
            null;

        callWindowClosing =
            false;

        activeCallWindowId =
            null;


        if (
            activeIncomingCallId ===
            callSysId
        ) {

            activeIncomingCallId =
                null;
        }


        if (
            activeOutgoingCallId ===
            callSysId
        ) {

            activeOutgoingCallId =
                null;
        }
    }
);
}

async function serviceCallApiRequest(
    pathName,
    method = 'GET',
    body = null
) {

    const config =
        loadConfig();

    if (
        !config ||
        !config.instanceUrl ||
        !config.accessToken
    ) {
        throw new Error(
            'ServiceCall Desktop is not connected to ServiceNow.'
        );
    }


    const url =
        config.instanceUrl.replace(/\/$/, '') +
        '/api/x_1806573_servic_0/servicecall_desktop_api' +
        pathName;


    const options = {
        method: method,

        headers: {
            'Accept': 'application/json',
            'Authorization':
                'Bearer ' + config.accessToken
        }
    };


    if (body) {
        options.headers['Content-Type'] =
            'application/json';

        options.body =
            JSON.stringify(body);
    }


    const response =
        await fetch(
            url,
            options
        );


    let data = {};

    try {
        data =
            await response.json();
    } catch (e) {
        data = {};
    }


    const result =
        data.result || data;


    if (
        response.status === 401 ||
        response.status === 403
    ) {

        const error =
            new Error(
                result.message ||
                'ServiceNow authentication is required.'
            );

        error.code =
            'AUTHENTICATION_REQUIRED';

        throw error;
    }


    if (!response.ok) {

        const error =
            new Error(
                result.message ||
                'ServiceCall request failed.'
            );

        error.code =
            result.code ||
            'SERVICECALL_API_ERROR';

        throw error;
    }


    return result;
}

ipcMain.handle(
    'servicecall-accept-call',
    async (
        event,
        callSysId
    ) => {

        return await serviceCallApiRequest(
            '/accept-call',
            'POST',
            {
                call_sys_id:
                    callSysId
            }
        );
    }
);


ipcMain.handle(
    'servicecall-decline-call',
    async (
        event,
        callSysId
    ) => {

        return await serviceCallApiRequest(
            '/decline-call',
            'POST',
            {
                call_sys_id:
                    callSysId
            }
        );
    }
);


ipcMain.handle(
    'servicecall-cancel-call',
    async (
        event,
        callSysId
    ) => {

        return await serviceCallApiRequest(
            '/cancel-call',
            'POST',
            {
                call_sys_id:
                    callSysId
            }
        );
    }
);


ipcMain.handle(
    'servicecall-end-call',
    async (
        event,
        callSysId
    ) => {

        return await serviceCallApiRequest(
            '/end-call',
            'POST',
            {
                call_sys_id:
                    callSysId
            }
        );
    }
);


ipcMain.handle(
    'servicecall-get-call-status',
    async (
        event,
        callSysId
    ) => {

        return await serviceCallApiRequest(
            '/call-status?call_sys_id=' +
            encodeURIComponent(
                callSysId
            ),
            'GET'
        );
    }
);

async function checkOutgoingCallOnce() {

    const config = loadConfig();

    if (
        !config ||
        !config.instanceUrl ||
        !config.accessToken
    ) {
        return;
    }


    try {

        const url =
            config.instanceUrl.replace(/\/$/, '') +
            '/api/x_1806573_servic_0/servicecall_desktop_api/outgoing-call';


        const response =
            await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        'Accept': 'application/json',

                        'Authorization':
                            'Bearer ' +
                            config.accessToken
                    }
                }
            );


        if (
            response.status === 401 ||
            response.status === 403
        ) {

            const error =
                new Error(
                    'Your ServiceNow session has expired. Please sign in again.'
                );

            error.code =
                'AUTHENTICATION_REQUIRED';

            throw error;
        }


        let data = {};

        try {

            data =
                await response.json();

        } catch (jsonError) {

            console.error(
                'Outgoing call JSON parse error:',
                jsonError
            );

            return;
        }


        const result =
            data.result || data;


        if (!response.ok) {

            console.error(
                'Outgoing call request failed:',
                result
            );

            return;
        }


        if (
            result &&
            result.success &&
            result.outgoing_call
        ) {

            const outgoingCallId =
                result.call_sys_id;


            if (
                outgoingCallId &&
                outgoingCallId !==
                    activeOutgoingCallId
            ) {

                activeOutgoingCallId =
                    outgoingCallId;


                console.log(
                    'Outgoing ServiceCall:',
                    result
                );


                showCallWindow(
                    result.state === 'connected'
                        ? 'connected'
                        : 'calling',

                    {
                        callSysId:
                            result.call_sys_id,

                        callNumber:
                            result.call_number,

                        name:
                            result.target_user_name ||
                            'Unknown User',

                        department:
                            result.target_department ||
                            ''
                    }
                );
            }


            return;
        }


        /*
         * No current outgoing ringing/connected call.
         */
        activeOutgoingCallId =
            null;

    } catch (error) {

        console.error(
            'Outgoing call check failed:',
            error
        );


        if (
            error.code ===
            'AUTHENTICATION_REQUIRED'
        ) {

            stopOutgoingCallLoop();


            if (
                mainWindow &&
                !mainWindow.isDestroyed()
            ) {

                mainWindow.webContents.send(
                    'servicecall-auth-status',
                    {
                        status:
                            'authentication_required',

                        message:
                            'Your ServiceNow session has expired. Please sign in again.'
                    }
                );
            }
        }
    }
}

function startOutgoingCallLoop() {

    stopOutgoingCallLoop();

    checkOutgoingCallOnce();

    outgoingCallTimer =
        setInterval(
            checkOutgoingCallOnce,
            3000
        );
}


function stopOutgoingCallLoop() {

    if (outgoingCallTimer) {

        clearInterval(
            outgoingCallTimer
        );

        outgoingCallTimer =
            null;
    }
}

ipcMain.handle(
    'servicecall-open-active-call',
    async () => {

        if (
            callWindow &&
            !callWindow.isDestroyed()
        ) {

            if (callWindow.isMinimized()) {
                callWindow.restore();
            }

            callWindow.show();
            callWindow.focus();

            return {
                success: true,
                active_call: true
            };
        }


        return {
            success: true,
            active_call: false,
            message: 'No active call window is currently available.'
        };
    }
);