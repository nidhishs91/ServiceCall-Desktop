const {
    contextBridge,
    ipcRenderer
} = require('electron');


contextBridge.exposeInMainWorld(
    'serviceCall',
    {

        saveInstance:
            (instanceUrl) =>
                ipcRenderer.invoke(
                    'servicecall-save-instance',
                    instanceUrl
                ),

        getInstance:
            () =>
                ipcRenderer.invoke(
                    'servicecall-get-instance'
                ),

        getConnectionStatus:
            () =>
                ipcRenderer.invoke(
                    'servicecall-get-connection-status'
                ),

        startLogin:
            () =>
                ipcRenderer.invoke(
                    'servicecall-start-login'
                ),

        openActiveCall:
            () =>
                ipcRenderer.invoke(
                    'servicecall-open-active-call'
                ),

        acceptCall:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-accept-call',
                    callSysId
                ),

        declineCall:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-decline-call',
                    callSysId
                ),

        cancelCall:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-cancel-call',
                    callSysId
                ),

        endCall:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-end-call',
                    callSysId
                ),

        getCallStatus:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-get-call-status',
                    callSysId
                ),


        /* -------------------------
           DYNAMIC MEDIA CREDENTIALS
        ------------------------- */

        getMediaCredentials:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-get-media-credentials',
                    callSysId
                ),


        onAuthStatus:
            (callback) => {

                ipcRenderer.on(
                    'servicecall-auth-status',
                    (
                        event,
                        data
                    ) => {

                        callback(data);
                    }
                );
            }
    }
);