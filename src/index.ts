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
-hq/-highestquality - flag to choose highest quality for aduio and video if choosen
-h/-help to get help`;


const args: Array<string> = process.argv.slice(2);
let link: string = '';//, onlyAudio = false;//, highestQuality = false;

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
        case '-a':
        case '-a':
            //onlyAudio = true;
            break;
        case '-hq':
        case '-highestquality':
            //highestQuality = true;
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
        stream.pipe(fs.createWriteStream(tempDir + fileName));
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
        const audioFormats: ytdl.videoFormat[] = ytdl.filterFormats(info.formats, 'audioonly');
        const audioFormatsNames: string[] = audioFormats.map((format, ind) => `${String(ind + 1)}: audio bitrate: ${format.audioBitrate}; audio quality: ${format.audioQuality}; aduioChannels: ${format.audioChannels}`);
        const audioSelector = createSelector('Select audio track', ['0: None', ...audioFormatsNames]);
        const audioFormatIndex: number = await audioSelector.select();
        if (audioFormatIndex === 0)
            audioFormat = null;
        else
            audioFormat = audioFormats[audioFormatIndex - 1];

        // video track selection
        let videoFormat: ytdl.videoFormat | null;
        const videoFormats: ytdl.videoFormat[] = ytdl.filterFormats(info.formats, 'videoonly');
        const videoFormatsNames: string[] = videoFormats.map((format, ind) => `${String(ind + 1)}: video bitrate: ${format.bitrate}; width: ${format.width}; height: ${format.height}; fps: ${format.fps}; quality: ${format.quality}`);
        const videoSelector = createSelector('Select video track', ['0: None', ...videoFormatsNames]);
        const videoFormatIndex: number = await videoSelector.select();
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
            await downloadStream(audioStream, audioFileName);
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
            await downloadStream(videoStream, videoFileName);
            console.log('Video downloaded');
        }

        //putting audio and video into one container
        if (videoFormat) {
            const query = ffmpeg().input(tempDir + videoFileName).videoCodec('libx264');
            let outputOptions = ['-metadata:s:v:0 language='];
            if (audioFormat) {
                query.input(tempDir + audioFileName).audioCodec('aac');
                outputOptions = [...outputOptions, '-profile:v high', '-level:v 4.0', '-metadata:s:a:0 language='];
            }
            query.output(outputDir + title + '.mkv').outputOptions(outputOptions);
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
            const query = ffmpeg().input(tempDir + audioFileName).audioCodec('mp3').output(outputDir + title + '.mp3').outputOptions('-profile:v high', '-level:v 4.0', '-metadata:s:a:0 language=');
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
        }
        console.log();
        console.log('All processing is finished');
    } else {
        console.log('You must provide URL for video');
    }
})().catch(err => console.log(err));