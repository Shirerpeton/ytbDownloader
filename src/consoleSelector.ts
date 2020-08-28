import readline from 'readline';

readline.emitKeypressEvents(process.stdin);

interface Selector {
    readonly title: string,
    readonly optionList: Array<string>,
    currentPosition: number,
    select: () => Promise<number>
}

const createSelector = (title: string, optionList: Array<string>): Selector => {
    let position: number = 0;

    const changePosition = (change: number): void => {
        const newPosition = position + change;
        if ((newPosition >= 0) && (newPosition < optionList.length))
            position += change;
    }

    const returnString = (): string => {
        return (title + '\n' + optionList.map((option, index) => (index === position ? ' ---> ' : '      ') + option).join('\n'));
    }

    const select = async (): Promise<number> => {
        process.stdin.setRawMode(true);
        return (new Promise((resolve) => {
            console.log(returnString());
            process.stdin.on('keypress', (_, key) => {
                if ((key.ctrl && key.name === 'c') || (key.name === 'escape')) {
                    console.log('exiting...');
                    process.exit();
                }
                switch (key.name) {
                    case 'down':
                        changePosition(1);
                        break;
                    case 'up':
                        changePosition(-1);
                        break;
                    case 'return':
                        process.stdin.setRawMode(false);
                        process.stdin.removeAllListeners('keypress');
                        resolve(position);
                        break;
                    default:
                        return;
                }
                readline.moveCursor(process.stdout, -250, -(optionList.length + 1));
                readline.clearScreenDown(process.stdout);
                console.log(returnString());
            })
        }
        ));
    }

    return {
        title: title,
        optionList: optionList,
        currentPosition: position,
        select: select
    }
}


export default createSelector;