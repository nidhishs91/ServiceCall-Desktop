/*
 * ServiceCall Media Converter
 *
 * Converts temporary ServiceCall recordings
 * into their final storage format.
 *
 * V1:
 *
 * Audio-only recording:
 * WebM -> MP3
 *
 * Recording containing screen share:
 * WebM (VP8 + Opus) -> MP4 (H.264 + AAC)
 */

const ffmpeg =
    require('fluent-ffmpeg');

const ffmpegPath =
    require('ffmpeg-static');

const fs =
    require('fs');

const path =
    require('path');

const os =
    require('os');

const crypto =
    require('crypto');


/* -------------------------------------------------------
   FFMPEG CONFIGURATION
------------------------------------------------------- */

if (!ffmpegPath) {

    throw new Error(
        'ServiceCall FFmpeg executable was not found.'
    );
}


ffmpeg.setFfmpegPath(
    ffmpegPath
);


/* -------------------------------------------------------
   TEMP DIRECTORY
------------------------------------------------------- */

function getServiceCallTempDirectory() {

    const tempDirectory =
        path.join(
            os.tmpdir(),
            'ServiceCall'
        );


    if (
        !fs.existsSync(
            tempDirectory
        )
    ) {

        fs.mkdirSync(
            tempDirectory,
            {
                recursive: true
            }
        );
    }


    return tempDirectory;
}


/* -------------------------------------------------------
   SAFE TEMP FILE ID
------------------------------------------------------- */

function createTempId() {

    return crypto
        .randomUUID()
        .replace(
            /-/g,
            ''
        );
}


/* -------------------------------------------------------
   DELETE TEMP FILE
------------------------------------------------------- */

function deleteFileSafely(
    filePath
) {

    if (!filePath) {
        return;
    }


    try {

        if (
            fs.existsSync(
                filePath
            )
        ) {

            fs.unlinkSync(
                filePath
            );
        }


    } catch (error) {

        console.warn(
            'Unable to delete temporary ServiceCall file:',
            error.message
        );
    }
}


/* -------------------------------------------------------
   NORMALIZE INPUT BUFFER
------------------------------------------------------- */

function normalizeRecordingBuffer(
    webmBuffer
) {

    if (!webmBuffer) {

        throw new Error(
            'ServiceCall recording data was not provided.'
        );
    }


    const inputBuffer =
        Buffer.isBuffer(
            webmBuffer
        )
            ? webmBuffer
            : Buffer.from(
                webmBuffer
            );


    if (
        inputBuffer.length <= 0
    ) {

        throw new Error(
            'ServiceCall recording is empty.'
        );
    }


    return inputBuffer;
}


/* -------------------------------------------------------
   WEBM -> MP3
------------------------------------------------------- */

async function convertWebmToMp3(
    webmBuffer
) {

    const inputBuffer =
        normalizeRecordingBuffer(
            webmBuffer
        );


    const tempDirectory =
        getServiceCallTempDirectory();


    const tempId =
        createTempId();


    const inputPath =
        path.join(
            tempDirectory,
            tempId + '.webm'
        );


    const outputPath =
        path.join(
            tempDirectory,
            tempId + '.mp3'
        );


    fs.writeFileSync(
        inputPath,
        inputBuffer
    );


    try {

        await new Promise(
            (
                resolve,
                reject
            ) => {

                ffmpeg(
                    inputPath
                )

                    /*
                     * MP3 is audio only.
                     *
                     * Even though our newer
                     * MediaRecorder WebM may contain
                     * a canvas video track, FFmpeg
                     * deliberately ignores it here.
                     */
                    .noVideo()

                    .audioCodec(
                        'libmp3lame'
                    )

                    .audioBitrate(
                        '128k'
                    )

                    .format(
                        'mp3'
                    )

                    .on(
                        'start',
                        () => {

                            console.log(
                                'ServiceCall MP3 conversion started.'
                            );
                        }
                    )

                    .on(
                        'error',
                        (error) => {

                            reject(
                                error
                            );
                        }
                    )

                    .on(
                        'end',
                        () => {

                            resolve();
                        }
                    )

                    .save(
                        outputPath
                    );
            }
        );


        if (
            !fs.existsSync(
                outputPath
            )
        ) {

            throw new Error(
                'ServiceCall MP3 conversion did not produce an output file.'
            );
        }


        const mp3Buffer =
            fs.readFileSync(
                outputPath
            );


        if (
            mp3Buffer.length <= 0
        ) {

            throw new Error(
                'Converted ServiceCall MP3 is empty.'
            );
        }


        console.log(
            'ServiceCall MP3 conversion completed.',
            'Size:',
            mp3Buffer.length
        );


        return {

            success:
                true,

            buffer:
                mp3Buffer,

            format:
                'mp3',

            mimeType:
                'audio/mpeg',

            size:
                mp3Buffer.length
        };


    } finally {

        deleteFileSafely(
            inputPath
        );


        deleteFileSafely(
            outputPath
        );
    }
}


/* -------------------------------------------------------
   WEBM -> MP4
------------------------------------------------------- */

async function convertWebmToMp4(
    webmBuffer
) {

    const inputBuffer =
        normalizeRecordingBuffer(
            webmBuffer
        );


    const tempDirectory =
        getServiceCallTempDirectory();


    const tempId =
        createTempId();


    const inputPath =
        path.join(
            tempDirectory,
            tempId + '.webm'
        );


    const outputPath =
        path.join(
            tempDirectory,
            tempId + '.mp4'
        );


    /*
     * Browser MediaRecorder output:
     *
     * Video:
     * VP8 canvas recording
     *
     * Audio:
     * Opus mixed conference audio
     */
    fs.writeFileSync(
        inputPath,
        inputBuffer
    );


    try {

        await new Promise(
            (
                resolve,
                reject
            ) => {

                ffmpeg(
                    inputPath
                )

                    /*
                     * Convert browser VP8 video
                     * to H.264 for the MP4 file.
                     */
                    .videoCodec(
                        'libx264'
                    )

                    /*
                     * Reasonable screen-recording
                     * quality for the V1 prototype.
                     */
                    .videoBitrate(
                        '2500k'
                    )

                    /*
                     * Convert Opus conference audio
                     * to AAC for MP4 compatibility.
                     */
                    .audioCodec(
                        'aac'
                    )

                    .audioBitrate(
                        '128k'
                    )

                    /*
                     * yuv420p provides broad playback
                     * compatibility.
                     *
                     * faststart moves MP4 metadata
                     * toward the beginning of the file
                     * for easier playback/streaming.
                     */
                    .outputOptions([
                        '-pix_fmt yuv420p',
                        '-preset veryfast',
                        '-movflags +faststart'
                    ])

                    .format(
                        'mp4'
                    )

                    .on(
                        'start',
                        () => {

                            console.log(
                                'ServiceCall MP4 conversion started.'
                            );
                        }
                    )

                    .on(
                        'error',
                        (error) => {

                            reject(
                                error
                            );
                        }
                    )

                    .on(
                        'end',
                        () => {

                            resolve();
                        }
                    )

                    .save(
                        outputPath
                    );
            }
        );


        if (
            !fs.existsSync(
                outputPath
            )
        ) {

            throw new Error(
                'ServiceCall MP4 conversion did not produce an output file.'
            );
        }


        const mp4Buffer =
            fs.readFileSync(
                outputPath
            );


        if (
            mp4Buffer.length <= 0
        ) {

            throw new Error(
                'Converted ServiceCall MP4 is empty.'
            );
        }


        console.log(
            'ServiceCall MP4 conversion completed.',
            'Size:',
            mp4Buffer.length
        );


        return {

            success:
                true,

            buffer:
                mp4Buffer,

            format:
                'mp4',

            mimeType:
                'video/mp4',

            size:
                mp4Buffer.length
        };


    } finally {

        /*
         * Do not leave either the source WebM
         * or final MP4 in the user's temp folder.
         */

        deleteFileSafely(
            inputPath
        );


        deleteFileSafely(
            outputPath
        );
    }
}


/* -------------------------------------------------------
   EXPORTS
------------------------------------------------------- */

module.exports = {

    convertWebmToMp3:
        convertWebmToMp3,

    convertWebmToMp4:
        convertWebmToMp4
};