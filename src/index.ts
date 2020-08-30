import ytdl from 'ytdl-core';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg'
import * as stream from 'stream';

import createSelector from './consoleSelector.js';
import progressBar from './progressBar.js';

const outputDir = './output/'
const tempDir = './temp/'

ffmpeg.setFfmpegPath('./ffmpeg/bin/ffmpeg.exe');
ffmpeg.setFfprobePath('./ffmpeg/bin/ffprobe.exe');

const help: string = `Help:
-l/-link - URL of youtube video
-oa/-only-audio - flag to download only aduio
-hq/-highest-quality - flag to choose highest quality for aduio and video if choosen
-af/-aduio-format - choose audio format for audio only files (aac, mp3 | default: mp3)
-cf/-container-format - choose format of container (mkv, mp4 | default: mkv) 
-h/-help to get help`;

enum audioExtensions {
    mp3 = 'mp3',
    aac = 'aac'
}

enum videoExtensions {
    mkv = 'mkv',
    mp4 = 'mp4'
}

const args: Array<string> = process.argv.slice(2);
let link: string = '', audioOny: boolean = false, highestQuality: boolean = false;
let audioExtension: audioExtensions = audioExtensions.mp3;
let videoExtension: videoExtensions = videoExtensions.mkv;

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '-h':
        case '-help':
            console.log(help);
            break;
        case '-l':
        case '-link':
            i++;
            link = args[i];
            break;
        case '-oa':
        case '-only-audio':
            audioOny = true;
            break;
        case '-hq':
        case '-highest-quality':
            highestQuality = true;
            break;
        case '-cf':
        case '-container-format':
            i++;
            if (args[i] === 'mkv') {
                videoExtension = videoExtensions.mkv;
            } else if (args[i] === 'mp4') {
                videoExtension = videoExtensions.mp4;
            }
            break;
        case '-af':
        case '-audio-format':
            i++;
            if (args[i] === 'aac') {
                audioExtension = audioExtensions.aac;
            } else if (args[i] === 'mp3') {
                audioExtension = audioExtensions.mp3;
            }
            break;
        default:
            console.log('Use -h/-help for help');
            break;
    }
}

const downloadStream = (stream: stream.Readable, fileName: string): Promise<void> => {
    return new Promise(resolve => {
        stream.on('end', () => {
            resolve();
        });
        stream.pipe(fs.createWriteStream(fileName));
    })
}

const convertFiles = (query: ffmpeg.FfmpegCommand): Promise<void> => {
    return new Promise(resolve => {
        query.on('end', () => {
            progressBar.redrawProgressBar(100, 'Converting file');
            resolve();
        });
        query.run();
    })
}

(async (): Promise<void> => {
    if (link) {
        // validating video url
        const valid = await ytdl.validateURL(link);
        if (!valid) {
            console.log('Invalid youtube URL');
            return;
        }

        // get video info
        const info: ytdl.videoInfo = await ytdl.getInfo(link);

        // audio track selelction
        let audioFormat: ytdl.videoFormat | null;
        if (!audioOny) {
            const audioFormats: ytdl.videoFormat[] = ytdl.filterFormats(info.formats, 'audioonly');
            const audioFormatsNames: string[] = audioFormats.map((format, ind) => `${String(ind + 1)}: audio bitrate: ${format.audioBitrate}; audio quality: ${format.audioQuality}; aduioChannels: ${format.audioChannels}`);
            let audioFormatIndex: number = 0;
            if (!highestQuality) {
                const audioSelector = createSelector('Select audio track', ['0: None', ...audioFormatsNames]);
                audioFormatIndex = await audioSelector.select();
            } else
                audioFormatIndex = 1;
            if (audioFormatIndex === 0)
                audioFormat = null;
            else
                audioFormat = audioFormats[audioFormatIndex - 1];
        } else
            audioFormat = null;

        // video track selection
        let videoFormat: ytdl.videoFormat | null;
        const videoFormats: ytdl.videoFormat[] = ytdl.filterFormats(info.formats, 'videoonly');
        const videoFormatsNames: string[] = videoFormats.map((format, ind) => `${String(ind + 1)}: video bitrate: ${format.bitrate}; width: ${format.width}; height: ${format.height}; fps: ${format.fps}; quality: ${format.quality}`);
        let videoFormatIndex: number = 0;
        if (!highestQuality) {
            const videoSelector = createSelector('Select video track', ['0: None', ...videoFormatsNames]);
            videoFormatIndex = await videoSelector.select();
        } else
            videoFormatIndex = 1;
        if (videoFormatIndex === 0)
            videoFormat = null;
        else
            videoFormat = videoFormats[videoFormatIndex - 1];

        if ((!videoFormat) && (!audioFormat)) {
            console.log('No tracks selected');
            console.log('exiting...');
            process.exit(0);
        }

        const title: string = (info.videoDetails.title).replace(/[\<\>\:\"\/\\\/\|\?\*]/g, '_');
        console.log('Title: ');
        console.log(title);

        //audio downlaod
        let audioFileName: string = '';
        if (audioFormat) {
            audioFileName = 'audio_' + title + '.' + audioFormat.container;
            console.log('Audio file name: ');
            console.log(audioFileName);
            const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });
            audioStream.on('progress', (_, segmentsDownloaded: number, segments: number) => {
                progressBar.redrawProgressBar((segmentsDownloaded / segments) * 100, 'Audio download');
            })
            console.log();
            progressBar.drawProgressBar(0, 'Audio download');
            await downloadStream(audioStream, tempDir + audioFileName);
            console.log('Audio downloaded');
        }

        //video downlaod
        let videoFileName: string = '';
        if (videoFormat) {
            videoFileName = 'video_' + title + '.' + videoFormat.container;
            const videoStream = ytdl.downloadFromInfo(info, { format: videoFormat });
            videoStream.on('progress', (_, segmentsDownloaded: number, segments: number) => {
                progressBar.redrawProgressBar((segmentsDownloaded / segments) * 100, 'Video download');
            });
            console.log();
            progressBar.drawProgressBar(0, 'Video download');
            await downloadStream(videoStream, tempDir + videoFileName);
            console.log('Video downloaded');
        }

        //converting audio and video streams and putting them into one container if necessary
        if (videoFormat) {
            const query = ffmpeg().input(tempDir + videoFileName).videoCodec('libx264');
            let outputOptions = ['-metadata:s:v:0 language='];
            if (audioFormat) {
                let audioBitrate: string = '128k';
                if (audioFormat.audioBitrate) {
                    if (audioFormat.audioBitrate <= 64)
                        audioBitrate = '64k';
                    else if (audioFormat.audioBitrate <= 128)
                        audioBitrate = '128k';
                    else if (audioFormat.audioBitrate <= 160)
                        audioBitrate = '160k';
                    else if (audioFormat.audioBitrate <= 256)
                        audioBitrate = '256k';
                }
                query.input(tempDir + audioFileName).audioCodec('aac').audioBitrate(audioBitrate);
                outputOptions = [...outputOptions, '-profile:v high', '-level:v 4.0', '-metadata:s:a:0 language='];
            }
            query.output(outputDir + title + '.' + videoExtension).outputOptions(outputOptions);
            query.on('error', err => {
                console.log('An error occurred: ' + err.message)
            });
            query.on('start', () => {
                console.log();
                console.log('Processing started!');
                progressBar.drawProgressBar(0, 'Converting file');
            });
            query.on('progress', progress => {
                progressBar.redrawProgressBar(progress.percent, 'Converting file');
            });
            await convertFiles(query);
            console.log('Processing complete');
        } else if (audioFormat) {
            const query = ffmpeg().input(tempDir + audioFileName).noVideo();
            let audioBitrate: string = '128k';
            if (audioFormat.audioBitrate) {
                if (audioFormat.audioBitrate <= 64)
                    audioBitrate = '64k';
                else if (audioFormat.audioBitrate <= 128)
                    audioBitrate = '128k';
                else if (audioFormat.audioBitrate <= 160)
                    audioBitrate = '160k';
                else if (audioFormat.audioBitrate <= 256)
                    audioBitrate = '256k';
            }
            if (audioExtension === audioExtensions.aac)
                query.audioCodec('aac').audioBitrate(audioBitrate).output(outputDir + title + '.' + audioExtension).outputOptions(['-profile:v high', '-level:v 4.0', '-metadata:s:a:0 language=']);
            else (audioExtension === audioExtensions.mp3)
            query.audioBitrate(audioBitrate).output(outputDir + title + '.' + audioExtension);
            query.on('error', err => {
                console.log('An error occurred: ' + err.message)
            });
            query.on('start', () => {
                console.log();
                console.log('Processing started!');
                progressBar.drawProgressBar(0, 'Converting file');
            });
            query.on('progress', progress => {
                progressBar.redrawProgressBar(progress.percent, 'Converting file');
            });
            await convertFiles(query);
            console.log();
            console.log('Processing complete');
        }
        if (audioFormat)
            await fs.promises.unlink(tempDir + audioFileName);
        if (videoFormat)
            await fs.promises.unlink(tempDir + videoFileName);
        console.log();
        console.log('All processing is finished');
    } else {
        console.log('You must provide URL for video');
    }
})().catch(err => console.log(err));