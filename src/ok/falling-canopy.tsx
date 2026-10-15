"use client"

import * as React from "react"
import { useEffect, useRef } from "react"

const MAX_DPR = 2
const MAX_LEAVES = 1400

const TRAVEL_AT_50 = 0.55
const DRAG = 1.7
const SPIN_MAX = 2.6
const SWIRL = 0.55
const SWAY_RATE = 2.2
const LEAF_W = 0.55
const SIZE_JITTER = 0.75

const VERT_LEAF = `
attribute vec2  aCorner;
attribute vec2  aPos;
attribute float aAngle;
attribute float aSize;
attribute float aTint;
uniform float uAspect;
uniform float uPxPerUnit;
varying vec2  vUv;
varying float vTint;
varying float vShade;
varying float vAA;
void main() {
    float c = cos(aAngle), s = sin(aAngle);
    vec2 off = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c) * aSize;
    vec2 p = aPos + off;
    gl_Position = vec4(p.x / max(uAspect, 0.0001), p.y, 0.0, 1.0);
    vUv = aCorner;
    vTint = aTint;

    vAA = 1.3 / max(aSize * uPxPerUnit, 1.0);

    vShade = 0.62 + 0.38 * abs(cos(aAngle));
}
`

const FRAG_LEAF = `
precision mediump float;
uniform vec3 uBase;
uniform vec3 uAccent;
varying vec2  vUv;
varying float vTint;
varying float vShade;
varying float vAA;
void main() {
    // Ewha: a rounded pear-blossom petal (narrow claw at the base, broad round
    // blade toward the tip) instead of the pointed leaf.
    float s01 = vUv.y * 0.5 + 0.5;
    float prof = sqrt(max(1.0 - vUv.y * vUv.y, 0.0)) * mix(0.32, 0.78, smoothstep(0.0, 0.7, s01));
    float d = abs(vUv.x) - prof;
    float a = 1.0 - smoothstep(-vAA, vAA, d);
    if (a <= 0.003) discard;

    vec3 col = mix(uBase, uAccent, vTint);
    // faint blush where the petal meets the calyx
    col = mix(col, col * vec3(1.0, 0.86, 0.88), smoothstep(-0.2, -0.95, vUv.y) * 0.5);
    col *= vShade;

    gl_FragColor = vec4(col * a, a);
}
`

function hexToRgb(hex: string): [number, number, number] {
    if (typeof hex !== "string") return [0.5, 0.5, 0.5]
    let s = hex.trim()
    const m = s.match(/^rgba?\(([^)]+)\)$/i)
    if (m) {
        const p = m[1].split(",").map((v) => parseFloat(v))
        return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255]
    }
    s = s.replace("#", "")
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
    if (s.length === 8) s = s.slice(0, 6)
    if (s.length !== 6) return [0.5, 0.5, 0.5]
    const n = parseInt(s, 16)
    if (!isFinite(n)) return [0.5, 0.5, 0.5]
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("LeafDrift shader:", gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
    }
    return sh
}

interface LeavesGroup {
    size?: number
    spin?: number
    sway?: number
}
interface FlowGroup {
    spread?: number
    scatter?: number
    turbulence?: number
}
interface CursorGroup {
    push?: number
    reach?: number
}

interface Props {
    background: string
    baseColor: string
    accentColor: string
    density: number
    speed: number
    direction: number
    leaves: LeavesGroup
    flow: FlowGroup
    cursor: CursorGroup
    width?: number
    height?: number
    style?: React.CSSProperties
}

const LEAVES_DEFAULTS: Required<LeavesGroup> = { size: 32, spin: 98, sway: 100 }
const FLOW_DEFAULTS: Required<FlowGroup> = { spread: 100, scatter: 0, turbulence: 0 }
const CURSOR_DEFAULTS: Required<CursorGroup> = { push: 200, reach: 80 }

export default function LeafDrift(props: Partial<Props>) {
    const {
        background = "#0E1410",
        baseColor = "#C9702B",
        accentColor = "#E8B23C",
        density = 1400,
        speed = 100,
        direction = 104,
        leaves,
        flow,
        cursor,
        width,
        height,
        style,
    } = props

    const lf = { ...LEAVES_DEFAULTS, ...(leaves || {}) }
    const fw = { ...FLOW_DEFAULTS, ...(flow || {}) }
    const cu = { ...CURSOR_DEFAULTS, ...(cursor || {}) }

    const hostRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    const live = useRef({
        density: 0,
        speed: 0,
        direction: 0,
        leafSize: 0,
        spin: 0,
        sway: 0,
        spread: 0,
        scatter: 0,
        turb: 0,
        push: 0,
        reach: 0,
        bg: [0, 0, 0] as number[],
        base: [1, 1, 1] as number[],
        accent: [1, 1, 1] as number[],
    })

    live.current = {
        density: Math.max(10, Math.min(MAX_LEAVES, Math.round(density))),
        speed,

        direction: (direction * Math.PI) / 180,
        leafSize: lf.size / 1000,
        spin: lf.spin / 100,
        sway: (lf.sway / 100) * 0.5,
        spread: fw.spread / 100,
        scatter: (fw.scatter * Math.PI) / 180,
        turb: fw.turbulence / 100,
        push: (cu.push / 100) * 2.2,
        reach: cu.reach / 100,
        bg: hexToRgb(background),
        base: hexToRgb(baseColor),
        accent: hexToRgb(accentColor),
    }

    useEffect(() => {
        const host = hostRef.current
        const canvas = canvasRef.current
        if (!host || !canvas) return

        const gl = canvas.getContext("webgl", {
            antialias: true,
            alpha: false,
            depth: false,

            preserveDrawingBuffer: true,
        }) as WebGLRenderingContext | null
        if (!gl) return

        const vs = compile(gl, gl.VERTEX_SHADER, VERT_LEAF)
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_LEAF)
        if (!vs || !fs) return
        const prog = gl.createProgram()
        if (!prog) return
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("LeafDrift link:", gl.getProgramInfoLog(prog))
            return
        }
        gl.useProgram(prog)

        const loc = {
            corner: gl.getAttribLocation(prog, "aCorner"),
            pos: gl.getAttribLocation(prog, "aPos"),
            angle: gl.getAttribLocation(prog, "aAngle"),
            size: gl.getAttribLocation(prog, "aSize"),
            tint: gl.getAttribLocation(prog, "aTint"),
            aspect: gl.getUniformLocation(prog, "uAspect"),
            pxPerUnit: gl.getUniformLocation(prog, "uPxPerUnit"),
            base: gl.getUniformLocation(prog, "uBase"),
            accent: gl.getUniformLocation(prog, "uAccent"),
        }

        gl.disable(gl.DEPTH_TEST)
        gl.enable(gl.BLEND)

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

        const px = new Float32Array(MAX_LEAVES)
        const py = new Float32Array(MAX_LEAVES)
        const vx = new Float32Array(MAX_LEAVES)
        const vy = new Float32Array(MAX_LEAVES)
        const ang = new Float32Array(MAX_LEAVES)
        const spn = new Float32Array(MAX_LEAVES)
        const sz = new Float32Array(MAX_LEAVES)
        const tint = new Float32Array(MAX_LEAVES)
        const scat = new Float32Array(MAX_LEAVES)
        const swPh = new Float32Array(MAX_LEAVES)
        const swRt = new Float32Array(MAX_LEAVES)
        let seeded = 0

        let rs = 0xbeef >>> 0
        const rand = () => {
            rs = (rs * 1664525 + 1013904223) >>> 0
            return rs / 4294967296
        }

        const LEAF_STRIDE = 7
        const leafData = new Float32Array(MAX_LEAVES * 6 * LEAF_STRIDE)
        const leafBuf = gl.createBuffer()

        const respawn = (i: number, dx: number, dy: number, R: number, spreadHalf: number, firstFill: boolean) => {
            const pxp = dy
            const pyp = -dx
            const along = firstFill ? (rand() * 2 - 1) * R : -R
            const across = (rand() * 2 - 1) * spreadHalf
            px[i] = dx * along + pxp * across
            py[i] = dy * along + pyp * across
            vx[i] = 0
            vy[i] = 0
            ang[i] = rand() * Math.PI * 2
            spn[i] = (rand() * 2 - 1) * SPIN_MAX
            sz[i] = 1 - SIZE_JITTER * 0.5 + SIZE_JITTER * rand()
            tint[i] = rand()
            scat[i] = rand() * 2 - 1
            swPh[i] = rand() * Math.PI * 2
            swRt[i] = 0.6 + rand() * 0.9
        }

        let bufW = 0
        let bufH = 0
        let aspect = 1
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)

            const bw = Math.max(1, Math.round((canvas.clientWidth || host.clientWidth || 1) * dpr))
            const bh = Math.max(1, Math.round((canvas.clientHeight || host.clientHeight || 1) * dpr))
            if (bw === bufW && bh === bufH) return
            bufW = bw
            bufH = bh
            aspect = bw / bh
            canvas.width = bw
            canvas.height = bh
            gl.viewport(0, 0, bw, bh)
        }
        const ro = new ResizeObserver(resize)
        ro.observe(host)
        resize()

        let curX = 0
        let curY = 0
        let engaged = false
        const onMove = (e: PointerEvent) => {
            const r = host.getBoundingClientRect()

            if (r.width <= 0 || r.height <= 0) return
            const m = Math.min(r.width, r.height)
            curX = (e.clientX - r.left - r.width * 0.5) / m
            curY = -(e.clientY - r.top - r.height * 0.5) / m
            engaged = true
        }

        window.addEventListener("pointermove", onMove)

        let clock = 0
        let last = 0
        let raf = 0

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame)
            const rawDt = last ? Math.min(0.05, (now - last) / 1000) : 0
            last = now
            const L = live.current
            const dt = rawDt * (L.speed / 50)
            clock += dt

            resize()

            const dx = Math.sin(L.direction)
            const dy = -Math.cos(L.direction)
            const ppx = dy
            const ppy = -dx

            const R = Math.hypot(aspect, 1) + 0.12
            const spreadHalf = L.spread * Math.hypot(aspect, 1)

            const n = L.density
            for (let i = seeded; i < n; i++) respawn(i, dx, dy, R, spreadHalf, true)
            if (n > seeded) seeded = n

            const reach2 = L.reach * L.reach
            const travel = TRAVEL_AT_50 * 2

            let w = 0
            for (let i = 0; i < n; i++) {
                const a = L.direction + scat[i] * L.scatter * 0.5
                const lx = Math.sin(a)
                const ly = -Math.cos(a)

                const s = Math.sin(clock * SWAY_RATE * swRt[i] + swPh[i]) * L.sway

                const fx = (Math.sin(py[i] * 2.3 + clock * 0.7) * 0.5 + Math.sin(px[i] * 3.1 - clock * 0.5) * 0.25) * L.turb
                const fy = (Math.sin(px[i] * 1.9 - clock * 0.5) * 0.5 + Math.sin(py[i] * 3.7 + clock * 0.6) * 0.25) * L.turb

                let ax = (lx * travel + ppx * s + fx - vx[i]) * DRAG
                let ay = (ly * travel + ppy * s + fy - vy[i]) * DRAG

                if (engaged && L.push > 0) {
                    const ddx = px[i] - curX
                    const ddy = py[i] - curY
                    const d2 = ddx * ddx + ddy * ddy
                    if (d2 < reach2 && d2 > 1e-8) {
                        const d = Math.sqrt(d2)

                        const f = (1 - d / L.reach) * L.push
                        ax += ((ddx / d) * (1 - SWIRL) + (-ddy / d) * SWIRL) * f
                        ay += ((ddy / d) * (1 - SWIRL) + (ddx / d) * SWIRL) * f
                    }
                }

                vx[i] += ax * dt
                vy[i] += ay * dt
                px[i] += vx[i] * dt
                py[i] += vy[i] * dt
                ang[i] += (spn[i] * L.spin + (vx[i] * ppx + vy[i] * ppy) * 1.6) * dt

                const along = px[i] * dx + py[i] * dy
                const across = px[i] * ppx + py[i] * ppy
                if (along > R || Math.abs(across) > spreadHalf + R) respawn(i, dx, dy, R, spreadHalf, false)

                const size = sz[i] * L.leafSize
                const cx = px[i]
                const cy = py[i]
                const an = ang[i]
                const ti = tint[i]
                const C = [-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]
                for (let k = 0; k < 6; k++) {
                    leafData[w++] = C[k * 2]
                    leafData[w++] = C[k * 2 + 1]
                    leafData[w++] = cx
                    leafData[w++] = cy
                    leafData[w++] = an
                    leafData[w++] = size
                    leafData[w++] = ti
                }
            }

            gl.clearColor(L.bg[0], L.bg[1], L.bg[2], 1)
            gl.clear(gl.COLOR_BUFFER_BIT)

            gl.useProgram(prog)
            gl.bindBuffer(gl.ARRAY_BUFFER, leafBuf)
            gl.bufferData(gl.ARRAY_BUFFER, leafData.subarray(0, w), gl.DYNAMIC_DRAW)
            const S = LEAF_STRIDE * 4
            gl.enableVertexAttribArray(loc.corner)
            gl.vertexAttribPointer(loc.corner, 2, gl.FLOAT, false, S, 0)
            gl.enableVertexAttribArray(loc.pos)
            gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, S, 8)
            gl.enableVertexAttribArray(loc.angle)
            gl.vertexAttribPointer(loc.angle, 1, gl.FLOAT, false, S, 16)
            gl.enableVertexAttribArray(loc.size)
            gl.vertexAttribPointer(loc.size, 1, gl.FLOAT, false, S, 20)
            gl.enableVertexAttribArray(loc.tint)
            gl.vertexAttribPointer(loc.tint, 1, gl.FLOAT, false, S, 24)
            gl.uniform1f(loc.aspect, aspect)

            gl.uniform1f(loc.pxPerUnit, bufH * 0.5)
            gl.uniform3fv(loc.base, L.base)
            gl.uniform3fv(loc.accent, L.accent)
            gl.drawArrays(gl.TRIANGLES, 0, n * 6)
        }
        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            window.removeEventListener("pointermove", onMove)

        }
    }, [])

    return (
        <div
            ref={hostRef}
            style={{
                position: "relative",
                overflow: "hidden",
                background,

                minWidth: 1200,
                minHeight: 800,
                width: typeof width === "number" && width > 0 ? width : "100%",
                height: typeof height === "number" && height > 0 ? height : "100%",
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            />
        </div>
    )
}