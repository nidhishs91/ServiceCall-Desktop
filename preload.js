const {
    contextBridge,
    ipcRenderer
} = require('electron');


contextBridge.exposeInMainWorld(
    'serviceCall',
    {

        /* -------------------------
           INSTANCE / CONNECTION
        ------------------------- */

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


        /* -------------------------
           AUTHENTICATION
        ------------------------- */

        startLogin:
            () =>
                ipcRenderer.invoke(
                    'servicecall-start-login'
                ),


        onAuthStatus:
            (callback) => {

                ipcRenderer.on(
                    'servicecall-auth-status',
                    (
                        event,
                        data
                    ) => {

                        callback(
                            data
                        );
                    }
                );
            },


        /* -------------------------
           ACTIVE CALL
        ------------------------- */

        openActiveCall:
            () =>
                ipcRenderer.invoke(
                    'servicecall-open-active-call'
                ),


        /* -------------------------
           CALL ACTIONS
        ------------------------- */

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

        leaveCall:
    (callSysId) =>
        ipcRenderer.invoke(
            'servicecall-leave-call',
            callSysId
        ),


        getCallStatus:
            (callSysId) =>
                ipcRenderer.invoke(
                    'servicecall-get-call-status',
                    callSysId
                ),


        /* -------------------------
           PARTICIPANTS
        ------------------------- */

        searchUsers:
            (searchText) =>
                ipcRenderer.invoke(
                    'servicecall-search-users',
                    searchText
                ),


        inviteParticipant:
            (
                callSysId,
                userSysId
            ) =>
                ipcRenderer.invoke(
                    'servicecall-invite-participant',
                    callSysId,
                    userSysId
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


/* -------------------------
   SCREEN SHARING
------------------------- */

getScreenSources:
    () =>
        ipcRenderer.invoke(
            'servicecall-get-screen-sources'
        ),

        setCallWindowLayout:
    (layout) =>
        ipcRenderer.invoke(
            'servicecall-set-call-window-layout',
            layout
        ),


/* -------------------------
   RECORDING
------------------------- */

startRecording:
    (callSysId) =>
        ipcRenderer.invoke(
            'servicecall-start-recording',
            callSysId
        ),

startCall: (
    targetUserSysId
) => {

    return ipcRenderer.invoke(
        'servicecall-start-call',
        targetUserSysId
    );
},

updatePresence: (
    status,
    oofReason = ''
) => {

    return ipcRenderer.invoke(
        'servicecall-update-presence',
        {
            status: status,
            oofReason: oofReason
        }
    );
},

checkAccess: () =>
    ipcRenderer.invoke(
        'servicecall-check-access'
    ),

getMyPresence: () => {

    return ipcRenderer.invoke(
        'servicecall-get-my-presence'
    );
},

signOut: () =>
    ipcRenderer.invoke(
        'servicecall-sign-out'
    ),

getSavedAccounts: () =>
    ipcRenderer.invoke(
        'servicecall-get-saved-accounts'
    ),

getCurrentAccount: () =>
    ipcRenderer.invoke(
        'servicecall-get-current-account'
    ),

activateSavedAccount: (
    accountKey
) =>
    ipcRenderer.invoke(
        'servicecall-activate-saved-account',
        accountKey
    ),

removeSavedAccount: (
    accountKey
) =>
    ipcRenderer.invoke(
        'servicecall-remove-saved-account',
        accountKey
    ),

finishRecording:
    (recordingSysId) =>
        ipcRenderer.invoke(
            'servicecall-finish-recording',
            recordingSysId
        ),

uploadRecording:
    (
        recordingSysId,
        fileData,
        fileName,
        format
    ) =>
        ipcRenderer.invoke(
            'servicecall-upload-recording',
            recordingSysId,
            fileData,
            fileName,
            format
        ),

finalizeVoiceRecording:
    (
        recordingSysId,
        webmData
    ) =>
        ipcRenderer.invoke(
            'servicecall-finalize-voice-recording',
            recordingSysId,
            webmData
        ),

        finalizeScreenRecording:
    (
        recordingSysId,
        webmData
    ) =>
        ipcRenderer.invoke(
            'servicecall-finalize-screen-recording',
            recordingSysId,
            webmData
        ),

    getRecordingHistory:
    () =>
        ipcRenderer.invoke(
            'servicecall-get-recording-history'
        ),
 
 
downloadRecording:
    (recordingSysId) =>
        ipcRenderer.invoke(
            'servicecall-download-recording',
            recordingSysId
        ),
 


completeRecording:
    (
        recordingSysId,
        attachmentSysId,
        format
    ) =>
        ipcRenderer.invoke(
            'servicecall-complete-recording',
            recordingSysId,
            attachmentSysId,
            format
        ),

    getMyMeetings:
    (
        page = 1,
        search = '',
        status = ''
    ) =>
        ipcRenderer.invoke(
            'servicecall-get-my-meetings',
            {
                page: page,
                search: search,
                status: status
            }
        ),

    getMeetingDetails:
    (meetingSysId) =>
        ipcRenderer.invoke(
            'servicecall-get-meeting-details',
            meetingSysId
        ),
        
    createMeeting:
    (meetingData) =>
        ipcRenderer.invoke(
            'servicecall-create-meeting',
            meetingData
        ),

    onDeepLink:
    (callback) => {

        ipcRenderer.on(
            'servicecall-deep-link',
            (
                event,
                data
            ) => {

                callback(data);
            }
        );
    },

    onDeepLink:
    (callback) => {

        const handler =
            (
                event,
                data
            ) => {

                callback(
                    data
                );
            };


        ipcRenderer.on(
            'servicecall-deep-link',
            handler
        );


        return () => {

            ipcRenderer.removeListener(
                'servicecall-deep-link',
                handler
            );
        };
    },

    rendererReady:
    () => {

        ipcRenderer.send(
            'servicecall-renderer-ready'
        );
    },

    getNotifications: (
    page = 1,
    pageSize = 20,
    search = ''
) => {

    return ipcRenderer.invoke(
        'servicecall-get-notifications',
        {
            page: page,
            pageSize: pageSize,
            search: search
        }
    );
},

markNotificationRead: (
    notificationSysId
) => {

    return ipcRenderer.invoke(
        'servicecall-mark-notification-read',
        notificationSysId
    );
},

testNotificationPopup: () => {

    return ipcRenderer.invoke(
        'servicecall-test-notification-popup'
    );
},

dismissNotificationPopup: () => {

    ipcRenderer.send(
        'servicecall-dismiss-notification-popup'
    );
},

    updateMeeting:
    (
        meetingSysId,
        meetingData
    ) =>
        ipcRenderer.invoke(
            'servicecall-update-meeting',
            meetingSysId,
            meetingData
        ),

    startMeeting:
    (meetingSysId) =>
        ipcRenderer.invoke(
            'servicecall-start-meeting',
            meetingSysId
        ),

    joinMeeting:
    (meetingSysId) =>
        ipcRenderer.invoke(
            'servicecall-join-meeting',
            meetingSysId
        ),

    leaveMeeting:
    (meetingSysId) =>
        ipcRenderer.invoke(
            'servicecall-leave-meeting',
            meetingSysId
        ),

    endMeeting:
    (meetingSysId) =>
        ipcRenderer.invoke(
            'servicecall-end-meeting',
            meetingSysId
        ),

    cancelMeeting:
    (meetingSysId) =>
        ipcRenderer.invoke(
            'servicecall-cancel-meeting',
            meetingSysId
        ),

    notifyMeetingChanged:
    (meetingSysId) =>
        ipcRenderer.send(
            'servicecall-meeting-changed',
            meetingSysId
        ),

onMeetingChanged:
    (callback) => {

        ipcRenderer.on(
            'servicecall-meeting-changed',
            (
                event,
                data
            ) => {

                callback(
                    data
                );
            }
        );
    }

    }
);

