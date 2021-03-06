import React, {useEffect, useImperativeHandle, useRef, useState} from "react";
import type {DosFactory, DosRuntime} from 'js-dos';
import {DosCommandInterface} from "js-dos/dist/typescript/js-dos-ci";
import ScreenshotTool from "./ScreenshotTool";
import {imgToBase64} from "./crops";
import {openDB} from "idb";

const showScreenshotTool = false

export type DosboxRef = {
    sendStrokes: (strokes: string[]) => Promise<void>,
    watchForImage: (image: WatchImage, abortSignal?: AbortSignal, interval?: number) => Promise<void>
    writeFile: (path: string, contents: Uint8Array) => Promise<void>,
    getFile: (path: String) => Promise<Uint8Array>
    hasImage: (image: WatchImage) => boolean
}

type DosboxProps = {
    variant?: string,
    zip: string,
    exe: string
    postStart?: string[]
}

type WatchImage = {
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    imageData: string
}

const sleep = millis => new Promise(cb => setTimeout(cb, millis))

const toKeyCodes = (strokes: string[]) => {
    return strokes.flatMap(command => {
        const [first, ...rest] = command
        if (first === ":") {
            const keyCodes: number[] = rest.map((char: string) => {
                const alphanumCode = char.toUpperCase().charCodeAt(0);
                if (alphanumCode >= 48 && alphanumCode <= 57) return alphanumCode;
                if (alphanumCode >= 65 && alphanumCode <= 90) return alphanumCode;
                throw new Error(`Got non-alphanumeric char ${char} in command string ${command}.`)
            });
            return keyCodes
        }
        const manualMap = {
            "left": 37,
            "up": 38,
            "right": 39,
            "down": 40,
            "alt": 18,
            "enter": 13,
            "esc": 27
        };
        const manualCode: number = manualMap[command.toLowerCase()]
        if (manualCode) return [manualCode];
        throw new Error(`Can't convert ${command} into keycode.`)
    })
}

const Dosbox = React.forwardRef<DosboxRef, DosboxProps>((props, ref) => {
    const {variant = "wdosbox", postStart = []} = props;

    const dosapp = useRef<DosCommandInterface>(null);
    const runtimeRef = useRef<DosRuntime>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [isError, setError] = useState(false)

    const sendStrokes = async function (strokes: string[]) {
        const keycodes = toKeyCodes(strokes)
        for (const keycode of keycodes) {
            console.debug(`Sending ${keycode} down...`)
            dosapp.current.simulateKeyEvent(keycode, true);
            await sleep(100)
            console.debug(`Sending ${keycode} up...`)
            dosapp.current.simulateKeyEvent(keycode, false);
            await sleep(100)
        }
    }

    const setup = async function (canvas: HTMLCanvasElement) {
        const windowTitle = document.title
        await import('js-dos'); // attaches `window.Dos`
        const Dos = (window as any).Dos as DosFactory;
        const options = {
            wdosboxUrl: `/dosbox/${variant}.js`,
            autolock: true,
            keyboardListeningElement: canvas
        };
        const runtime = await Dos(canvas, options);
        runtimeRef.current = runtime;
        await runtime.fs.extract(props.zip, "/game");
        await runtime.fs.chdir("/game");
        dosapp.current = await runtime.main(["-c", "cd game", "-c", props.exe]);
        document.title = windowTitle // since DosBox overwrites this
        await sendStrokes(postStart)
    };

    const hasImage = function (image: WatchImage) {
        const canvasCtx = canvasRef.current.getContext('2d')
        const screenshot = imgToBase64(canvasCtx.getImageData(image.sx, image.sy, image.sw, image.sh))
        return screenshot === image.imageData
    }

    const watchForImage = async function (image: WatchImage, abortSignal: AbortSignal, interval = 64) {
        let matched = false
        while (!matched) {
            await sleep(interval)
            matched = hasImage(image) || (abortSignal && abortSignal.aborted)
        }
    }

    const writeFile = async function (path: string, contents: Uint8Array) {
        const fs = runtimeRef.current.fs
        const emscriptenFs = (fs as any).fs
        if (emscriptenFs.analyzePath(path).exists) {
            emscriptenFs.unlink(path)
        }
        fs.createFile(path, contents)
    }

    const getFile = async function (path: string) {
        const fs = runtimeRef.current.fs
        await (fs as any).syncFs()

        const idb = await openDB('/game', 21, {
            upgrade(db) {
                db.createObjectStore('FILE_DATA');
            },
        })
        const file = await idb.get('FILE_DATA', path)
        return file.contents
    }

    useImperativeHandle(ref, () => ({sendStrokes, watchForImage, hasImage, writeFile, getFile}))

    useEffect(() => {
        canvasRef.current.focus(); // so it receives keyboard events

        setup(canvasRef.current).catch((error) => {
            console.error(error)
            setError(true)
        });

        return () => {
            if (dosapp.current) {
                dosapp.current.exit();
            }
        }
    }, [canvasRef]);

    return isError ? <span style={{color: "red"}}>Error!</span> : (
        <div>
            {/* language=CSS */}
            <style jsx>{`
                .dosbox-container {
                    height: 480px;
                }

                canvas {
                    outline: none !important;
                }

                .full-screen {
                    float: right;
                    width: 48px;
                    margin-top: 15px;
                    padding: 5px;
                    transition: 150ms filter linear;
                }

                .full-screen:hover {
                    filter: invert(1);
                }

            `}</style>
            {/* The dosbox-container keeps dosbox.js from messing up the DOM in a way that breaks React unloading the component. */}
            <div className="dosbox-container">
                {/* See https://github.com/caiiiycuk/js-dos/issues/94#issuecomment-686199565 */}
                <canvas ref={canvasRef} tabIndex={0} onClick={() => canvasRef.current.focus()}/>
            </div>
            <img src="fullscreen.svg" onClick={() => dosapp.current.fullscreen()} className="full-screen"/>
            <br/><br/>
            {showScreenshotTool ? <ScreenshotTool sourceCanvas={canvasRef}/> : null}
        </div>
    );
});

export default Dosbox;
