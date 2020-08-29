import ytdl from 'ytdl-core';
import fs from 'fs';
import * as stream from 'stream';

import createSelector from './consoleSelector.js';
import progressBar from './progressBar.js';

const outputDir = './output/'

const help: string = `Help:
-l/-link - URL of youtube video
-a/-audio - flag to download only aduio
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

const downloadStream = (stream: stream.Readable, fileName: string):Promise<boolean>  => {
    return new Promise(resolve => {
        stream.on('end', () => {
            resolve(true);
        });
        stream.pipe(fs.createWriteStream(outputDir + fileName));
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

        const title: string = info.videoDetails.title;
        if (audioFormat) {
            const fileName = (videoFormat? 'audio_': '') + title + '.' + audioFormat.container;
            const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });
            audioStream.on('progress', (_, segmentsDownloaded: number, segments: number) => {
                progressBar.redrawProgressBar((segmentsDownloaded / segments) * 100, 'Audio download');
            })
            console.log();
            progressBar.drawProgressBar(0, 'Audio download');
            await downloadStream(audioStream, fileName);
            console.log('Audio downloaded');
        }
        if (videoFormat) {
            const fileName = (audioFormat? 'video_': '') + title + '.' + videoFormat.container;
            const videoStream = ytdl.downloadFromInfo(info, { format: videoFormat });
            videoStream.on('progress', (_, segmentsDownloaded: number, segments: number) => {
                progressBar.redrawProgressBar((segmentsDownloaded / segments) * 100, 'Video download');
            })
            console.log();
            progressBar.drawProgressBar(0, 'Video download');
            await downloadStream(videoStream, fileName);
            console.log('Video downloaded');
        }
    }
    
    console.log();
    console.log('Finished');
})().catch(err => console.log(err));