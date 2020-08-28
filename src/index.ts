import ytdl from 'ytdl-core'
import fs from 'fs'

import createSelector from './consoleSelector.js'

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

(async (): Promise<void> => {
    if (link) {
        let audioFormat: ytdl.videoFormat | null;
        let videoFormat: ytdl.videoFormat | null;

        const valid = await ytdl.validateURL(link);
        if (!valid) {
            console.log('Invalid youtube URL');
            return;
        }
        const info: ytdl.videoInfo = await ytdl.getInfo(link);

        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        const audioFormatsNames = audioFormats.map((format, ind) => `${String(ind + 1)}: audio bitrate: ${format.audioBitrate}; audio quality: ${format.audioQuality}; aduioChannels: ${format.audioChannels}`);
        const audioSelector = createSelector('Select audio track', ['0: None', ...audioFormatsNames]);
        const audioFormatIndex: number = await audioSelector.select();
        if (audioFormatIndex === 0)
            audioFormat = null;
        else
            audioFormat = audioFormats[audioFormatIndex - 1];

        const videoFormats = ytdl.filterFormats(info.formats, 'videoonly');
        const videoFormatsNames = videoFormats.map((format, ind) => `${String(ind + 1)}: video bitrate: ${format.bitrate}; width: ${format.width}; height: ${format.height}; fps: ${format.fps}; quality: ${format.quality}`);
        const videoSelector = createSelector('Select video track', ['0: None', ...videoFormatsNames]);
        const videoFormatIndex: number = await videoSelector.select();
        if (videoFormatIndex === 0)
            videoFormat = null;
        else
            videoFormat = videoFormats[videoFormatIndex - 1];
        const title = info.videoDetails.title;
        if ((!videoFormat) && (!audioFormat)) {
            console.log('No tracks selected');
            console.log('exiting...');
            process.exit(0);
        }
        //if (audioFormat) {
            //ytdl.downloadFromInfo(info, { format: audioFormat }).pipe(fs.createWriteStream(outputDir + title + '.' + audioFormat.container));
        //}
    }
})();