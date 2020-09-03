import React, {Dispatch, MutableRefObject, SetStateAction, useEffect, useRef, useState} from "react";
import {toBase64} from "./crops";

type Props = {
    sourceCanvas: MutableRefObject<HTMLCanvasElement>
}

const ScreenshotTool = (props: Props) => {
    const {sourceCanvas} = props

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [visible, setVisible] = useState(false)
    const [screenshot, setScreenshot] = useState({
        dataUrl: null as string,
        imageData: null as ImageData
    });
    const [sx, setSx] = useState(0)
    const [sy, setSy] = useState(0)
    const [sw, setSw] = useState(640)
    const [sh, setSh] = useState(480)
    const editors: [string, number, Dispatch<SetStateAction<number>>][] = [
        ["x", sx, setSx],
        ["y", sy, setSy],
        ["w", sw, setSw],
        ["h", sh, setSh],
    ]

    const onClickScreenshot = (event) => {
        setScreenshot({
            dataUrl: sourceCanvas.current.toDataURL(),
            imageData: sourceCanvas.current.getContext('2d').getImageData(0, 0, 640, 480)
        })
        resetEditors()
    }

    const resetEditors = () => {
        setSx(0)
        setSy(0)
        setSw(640)
        setSh(480)
    }

    const copyImageData = () => {
        const ctx = canvasRef.current.getContext('2d')
        const imageData = ctx.getImageData(0, 0, sw, sh)
        const jsData = {sx, sy, sw, sh, imageData: toBase64(imageData)}
        navigator.clipboard.writeText(JSON.stringify(jsData))
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (screenshot.imageData && canvas) {
            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            let newData = []
            for (let row = sy; row < sy + sh; row++) {
                const left = (screenshot.imageData.width * row) + sx
                const right = left + sw
                screenshot.imageData.data.slice(left * 4, right * 4).forEach(n => newData.push(n))
            }
            if (newData.length > 0 && newData.length % (4 * sw * sh) == 0) {
                const croppedImage = new ImageData(new Uint8ClampedArray(newData), sw, sh)
                ctx.putImageData(croppedImage, 0, 0)
            } else {
                console.warn(`Cropped image ended up with ${newData.length / 4} data points.`)
            }
        }
    }, [sx, sy, sw, sh, screenshot])

    return (
        <fieldset>
            <legend onClick={() => setVisible(v => !v)}>Analyze Screenshot</legend>
            {!visible ? null : <>
                <button type="button" onClick={onClickScreenshot}>Capture</button>
                {" "}
                {editors.map(([name, value, setter]) =>
                    <label key={name}>
                        {name} <input type="number" value={value} onChange={evt => setter(evt.target.valueAsNumber)}/>
                    </label>)}{" "}
                <button type="reset" onClick={resetEditors}>Reset</button>
                {" "}
                <button type="button" onClick={copyImageData}>Copy ImageData</button>
                {" "}
                <br/>
                <a href={screenshot.dataUrl} download={`ctf-screenshot-${Date.now()}.png`}>
                    <canvas ref={canvasRef} width={sw} height={sh}/>
                </a>
            </>}
        </fieldset>
    );
}

export default ScreenshotTool;
