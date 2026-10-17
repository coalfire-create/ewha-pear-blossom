"use client"

import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"
import * as THREE from "three"

const MAX_COLORS = 8

const DEFAULT_COLORS = ["#F2CC35"]

const DEFAULT_BACKGROUND = "#0A0A12"

const DEFAULT_SHAPE = {
    height: 10,
    waist: 2.2,
    flare: 5,
    twist: 0.5,
}

const DEFAULT_CORE = {
    show: true,
    diameter: 2.4,
    color: "#FF8800",
    spin: 2,
}

const DEFAULT_CAMERA = {
    zoom: 7,
    turn: -180,
    elevation: 85,
    orbit: false,
    wheel: false,
}

const POINTS_PER_STRAND = 750
const MIN_STRANDS = 24
const MAX_STRANDS = 2000

const CORE_DOT = 5

const BLOOM_RADIUS = 1.2
const BLOOM_THRESHOLD = 0.96

const DRAG_SPEED = 1

const GLOW_OPACITY = 0.25

export interface EnergyStreamShape {
    height?: number

    waist?: number

    flare?: number

    twist?: number
}

export interface EnergyStreamCore {
    show?: boolean

    diameter?: number
    color?: string

    spin?: number
}

export interface EnergyStreamCamera {
    zoom?: number

    turn?: number

    elevation?: number

    orbit?: boolean

    wheel?: boolean
}

export interface EnergyStreamProps {
    colors?: string[]

    background?: string

    particles?: number
    shape?: EnergyStreamShape

    lean?: number

    size?: number
    core?: EnergyStreamCore

    glow?: number

    repel?: number

    flow?: number

    spin?: number
    camera?: EnergyStreamCamera
    style?: CSSProperties
}

const PARTICLE_VERT = `
precision highp float;

uniform float uTime;
uniform float uFlow;
uniform float uSize;
uniform float uMinY;
uniform float uMaxY;
uniform float uWaist;
uniform float uFlare;
uniform float uTwist;
uniform float uSpin;
uniform vec2 uPointer;
uniform float uHover;
uniform float uReach;
uniform float uPush;
uniform float uAspect;
uniform vec3 uColors[MAX_COLORS];
uniform float uColorCount;

attribute vec3 aRandom;

varying float vAlpha;
varying float vGlow;
varying float vProgress;
varying float vRepel;
varying vec3 vTint;

float radiusAtY(float y, float waist, float flare) {
    return waist * sqrt(1.0 + (y * y) / (flare * flare));
}

vec3 paletteAt(float t) {
    float n = max(1.0, uColorCount);
    float x = fract(t) * n;
    float lo = floor(x);
    int i = int(lo);
    int j = int(mod(lo + 1.0, n));

    vec3 a = uColors[0];
    vec3 b = uColors[0];
    for (int k = 0; k < MAX_COLORS; k++) {
        if (k == i) a = uColors[k];
        if (k == j) b = uColors[k];
    }
    return mix(a, b, x - lo);
}

void main() {
    float speedVar = 0.8 + 0.4 * aRandom.z;
    float progress = fract(aRandom.x + uTime * uFlow * speedVar);

    float y = mix(uMaxY, uMinY, progress);
    float r = radiusAtY(y, uWaist, uFlare) * mix(0.70, 1.00, aRandom.z);
    float phi = 6.2831853 * aRandom.y + progress * 6.2831853 * uTwist + uSpin;
    vec3 pos = vec3(r * cos(phi), y, r * sin(phi));

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;

    vRepel = 0.0;
    if (uHover > 0.001 && clip.w > 0.0) {
        vec2 ndc = clip.xy / clip.w;
        vec2 away = vec2((ndc.x - uPointer.x) * uAspect, ndc.y - uPointer.y);
        float dist = length(away);
        float falloff = 1.0 - smoothstep(0.0, uReach, dist);
        vRepel = falloff * uHover;

        vec2 dir = dist > 1e-4 ? away / dist : vec2(1.0, 0.0);
        clip.xy += vec2(dir.x / uAspect, dir.y) * vRepel * uPush * clip.w;
    }

    gl_PointSize = uSize / max(0.0001, -mv.z) * (1.0 + vRepel * 0.45);
    gl_Position = clip;

    float neckGlow = 1.0 - smoothstep(0.0, 0.28 * uMaxY, abs(y));
    float edgeFade = smoothstep(0.0, 0.06, progress) * (1.0 - smoothstep(0.94, 1.0, progress));

    vGlow = neckGlow;
    vAlpha = 0.23 + 0.62 * neckGlow * edgeFade;
    vProgress = progress;
    vTint = paletteAt(aRandom.y) * (0.90 + 0.20 * aRandom.z);
}
`

const PARTICLE_FRAG = `
precision highp float;

varying float vAlpha;
varying float vGlow;
varying float vProgress;
varying float vRepel;
varying vec3 vTint;

void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;

    float falloff = pow(1.0 - r2, 1.7);
    float sparkle = 0.85 + 0.15 * sin(50.0 * vProgress);

    vec3 col = vTint;
    col += 0.15 * vGlow;

    col += vTint * vRepel * 0.45;

    gl_FragColor = vec4(col, (vAlpha + vRepel * 0.15) * falloff * sparkle);
}
`

const QUAD_VERT = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const PREFILTER_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float lum = max(c.r, max(c.g, c.b));
    float soft = clamp(lum - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 0.0001);
    gl_FragColor = vec4(c * max(soft, lum - uThreshold) / max(lum, 0.0001), 1.0);
}
`

const DOWN_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;

vec3 tap(float x, float y) {
    return texture2D(tDiffuse, vUv + vec2(x, y) * uTexel).rgb;
}

void main() {
    vec3 a = tap(-2.0,  2.0), b = tap( 0.0,  2.0), c = tap( 2.0,  2.0);
    vec3 d = tap(-2.0,  0.0), e = tap( 0.0,  0.0), f = tap( 2.0,  0.0);
    vec3 g = tap(-2.0, -2.0), h = tap( 0.0, -2.0), i = tap( 2.0, -2.0);
    vec3 j = tap(-1.0,  1.0), k = tap( 1.0,  1.0);
    vec3 l = tap(-1.0, -1.0), m = tap( 1.0, -1.0);

    vec3 sum = e * 0.125;
    sum += (a + c + g + i) * 0.03125;
    sum += (b + d + f + h) * 0.0625;
    sum += (j + k + l + m) * 0.125;
    gl_FragColor = vec4(sum, 1.0);
}
`

const UP_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;

vec3 tap(float x, float y) {
    return texture2D(tDiffuse, vUv + vec2(x, y) * uTexel * uRadius).rgb;
}

void main() {
    vec3 sum = tap(-1.0,  1.0) + tap(0.0,  1.0) * 2.0 + tap(1.0,  1.0);
    sum += tap(-1.0,  0.0) * 2.0 + tap(0.0,  0.0) * 4.0 + tap(1.0,  0.0) * 2.0;
    sum += tap(-1.0, -1.0) + tap(0.0, -1.0) * 2.0 + tap(1.0, -1.0);
    gl_FragColor = vec4(sum * 0.0625, 1.0);
}
`

const COMPOSITE_FRAG = `
precision highp float;
uniform sampler2D tBase;
uniform sampler2D tBloom;
uniform float uStrength;
varying vec2 vUv;

void main() {
    vec4 base = texture2D(tBase, vUv);
    vec3 bloom = texture2D(tBloom, vUv).rgb * uStrength;
    float glow = max(bloom.r, max(bloom.g, bloom.b));
    gl_FragColor = vec4(base.rgb + bloom, clamp(base.a + glow, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`

function merge<T extends object>(base: T, over?: Partial<T>): T {
    const out = { ...base }
    if (!over) return out
    for (const key of Object.keys(over) as (keyof T)[]) {
        const value = over[key]
        if (value !== undefined) out[key] = value as T[keyof T]
    }
    return out
}

function makeParams(p: EnergyStreamProps) {
    const picked = (p.colors ?? []).filter(
        (c) => typeof c === "string" && c.length > 0
    )

    const count = Number(p.particles)

    return {
        colors: (picked.length ? picked : DEFAULT_COLORS).slice(0, MAX_COLORS),
        background: p.background ?? DEFAULT_BACKGROUND,
        particles: Number.isFinite(count) && count >= 1 ? Math.round(count) : 500000,
        shape: merge(DEFAULT_SHAPE, p.shape),
        lean: p.lean ?? 0,
        size: p.size ?? 5,
        core: merge(DEFAULT_CORE, p.core),
        glow: p.glow ?? 10,
        repel: p.repel ?? 10,
        flow: p.flow ?? 10,
        spin: p.spin ?? 2,
        camera: merge(DEFAULT_CAMERA, p.camera),
    }
}

type Params = ReturnType<typeof makeParams>

const FROZEN_TIME = 2.4

const ORBIT_DAMPING = 0.08

const DEG = Math.PI / 180

const CORE_RADIUS = 1.2

const distanceFor = (zoom: number) =>
    3 + 25 * Math.pow(1 - Math.min(10, Math.max(0, zoom)) / 10, 2)

const makeRT = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
    })

export default function EnergyStream(props: EnergyStreamProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    const paramsRef = useRef<Params>(makeParams(props))
    paramsRef.current = makeParams(props)
    const p = paramsRef.current

    const apiRef = useRef<{
        invalidate: () => void
        setCloud: (count: number) => void
    } | null>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        let renderer: THREE.WebGLRenderer
        try {
            renderer = new THREE.WebGLRenderer({
                antialias: false,
                alpha: true,
                powerPreference: "high-performance",
            })
        } catch (err) {
            console.error("[energy-stream] could not create a WebGL context:", err)
            return
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setClearColor(0x000000, 0)
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1

        renderer.autoClear = false

        const canvas = renderer.domElement
        canvas.style.position = "absolute"
        canvas.style.inset = "0"
        canvas.style.display = "block"
        container.appendChild(canvas)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200)

        const uniforms = {
            uTime: { value: 0 },
            uFlow: { value: 0.2 },
            uSize: { value: 12 },
            uMinY: { value: -5 },
            uMaxY: { value: 5 },
            uWaist: { value: 2.2 },
            uFlare: { value: 2.5 },
            uTwist: { value: 0.5 },
            uSpin: { value: 0 },
            uPointer: { value: new THREE.Vector2(0, 0) },
            uHover: { value: 0 },
            uReach: { value: 0.36 },
            uPush: { value: 0.15 },
            uAspect: { value: 1 },
            uColors: {
                value: Array.from(
                    { length: MAX_COLORS },
                    () => new THREE.Color(DEFAULT_COLORS[0])
                ),
            },
            uColorCount: { value: 1 },
        }

        const streamMat = new THREE.ShaderMaterial({
            defines: { MAX_COLORS },
            uniforms,
            vertexShader: PARTICLE_VERT,
            fragmentShader: PARTICLE_FRAG,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            transparent: true,
        })

        const buildCloud = (count: number) => {
            const lanes = Math.min(
                MAX_STRANDS,
                Math.max(MIN_STRANDS, Math.round(count / POINTS_PER_STRAND))
            )
            const per = Math.max(1, Math.floor(Math.max(1, count) / lanes))
            const total = lanes * per

            const geo = new THREE.BufferGeometry()

            geo.setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(total * 3), 3)
            )

            const rnd = new Float32Array(total * 3)
            let i = 0
            for (let t = 0; t < lanes; t++) {
                const lane = t / lanes
                const layer = Math.random()
                for (let j = 0; j < per; j++) {
                    rnd[i * 3] = Math.random()
                    rnd[i * 3 + 1] = lane
                    rnd[i * 3 + 2] = layer
                    i++
                }
            }
            geo.setAttribute("aRandom", new THREE.BufferAttribute(rnd, 3))
            return geo
        }

        const rig = new THREE.Group()
        scene.add(rig)

        const stream = new THREE.Points(
            buildCloud(p.particles),
            streamMat
        )
        stream.frustumCulled = false
        rig.add(stream)

        const coreGeo = new THREE.SphereGeometry(CORE_RADIUS, 48, 48)
        const coreMat = new THREE.PointsMaterial({
            size: 0.025,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        })
        const core = new THREE.Points(coreGeo, coreMat)
        rig.add(core)

        const quadScene = new THREE.Scene()
        const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const quadGeo = new THREE.PlaneGeometry(2, 2)
        const quad = new THREE.Mesh(quadGeo)
        quad.frustumCulled = false
        quadScene.add(quad)

        const passMat = (
            fragmentShader: string,
            extra: Record<string, THREE.IUniform>
        ) =>
            new THREE.ShaderMaterial({
                uniforms: { tDiffuse: { value: null }, ...extra },
                vertexShader: QUAD_VERT,
                fragmentShader,
                depthTest: false,
                depthWrite: false,
                blending: THREE.NoBlending,
                toneMapped: false,
            })

        const prefilterMat = passMat(PREFILTER_FRAG, {
            uThreshold: { value: 0.96 },
            uKnee: { value: 0.48 },
        })
        const downMat = passMat(DOWN_FRAG, {
            uTexel: { value: new THREE.Vector2() },
        })
        const upMat = passMat(UP_FRAG, {
            uTexel: { value: new THREE.Vector2() },
            uRadius: { value: 1.2 },
        })

        upMat.blending = THREE.AdditiveBlending

        const compositeMat = new THREE.ShaderMaterial({
            uniforms: {
                tBase: { value: null },
                tBloom: { value: null },
                uStrength: { value: 0.6 },
            },
            vertexShader: QUAD_VERT,
            fragmentShader: COMPOSITE_FRAG,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NoBlending,
            transparent: true,
        })

        const blit = (
            mat: THREE.Material,
            target: THREE.WebGLRenderTarget | null,
            clear: boolean
        ) => {
            quad.material = mat
            renderer.setRenderTarget(target)
            if (clear) renderer.clear(true, false, false)
            renderer.render(quadScene, quadCam)
        }

        const rtScene = makeRT(1, 1)
        let mips: { rt: THREE.WebGLRenderTarget; w: number; h: number }[] = []
        let renderHeight = 900
        let sizeW = 0
        let sizeH = 0
        let dirty = true

        const dropMips = () => {
            for (const m of mips) m.rt.dispose()
            mips = []
        }

        const resize = () => {
            const w = Math.max(1, container.clientWidth)
            const h = Math.max(1, container.clientHeight)
            if (w === sizeW && h === sizeH) return
            sizeW = w
            sizeH = h

            renderer.setSize(w, h)
            camera.aspect = w / h
            camera.updateProjectionMatrix()

            const dpr = renderer.getPixelRatio()
            const pw = Math.max(1, Math.round(w * dpr))
            const ph = Math.max(1, Math.round(h * dpr))
            renderHeight = ph
            rtScene.setSize(pw, ph)

            const levels = Math.max(
                2,
                Math.min(5, Math.floor(Math.log2(Math.min(pw, ph))) - 3)
            )
            dropMips()
            let mw = Math.max(1, pw >> 1)
            let mh = Math.max(1, ph >> 1)
            for (let i = 0; i < levels; i++) {
                mips.push({ rt: makeRT(mw, mh), w: mw, h: mh })
                mw = Math.max(1, mw >> 1)
                mh = Math.max(1, mh >> 1)
            }

            dirty = true
        }

        resize()

        const ro = new ResizeObserver(resize)
        ro.observe(container)

        let onScreen = true
        const io = new IntersectionObserver(
            (entries) => {
                onScreen = entries.some((e) => e.isIntersecting)
            },
            { rootMargin: "200px" }
        )
        io.observe(container)

        const thetaFor = (turn: number) => Math.PI / 2 + turn * DEG

        const orbit = {
            theta: thetaFor(p.camera.turn),
            el: p.camera.elevation * DEG,
            radius: distanceFor(p.camera.zoom),
            dTheta: 0,
            dEl: 0,
        }
        const leanAxis = new THREE.Vector3()
        let lastTurn = p.camera.turn
        let lastElevation = p.camera.elevation
        let lastZoom = p.camera.zoom
        let dragging = false

        const stepOrbit = () => {
            const c = paramsRef.current.camera

            if (c.turn !== lastTurn) {
                lastTurn = c.turn
                orbit.theta = thetaFor(c.turn)
                orbit.dTheta = 0
            }
            if (c.elevation !== lastElevation) {
                lastElevation = c.elevation
                orbit.el = c.elevation * DEG
                orbit.dEl = 0
            }
            if (c.zoom !== lastZoom) {
                lastZoom = c.zoom
                orbit.radius = distanceFor(c.zoom)
            }

            orbit.theta += orbit.dTheta * ORBIT_DAMPING
            orbit.el += orbit.dEl * ORBIT_DAMPING
            orbit.dTheta *= 1 - ORBIT_DAMPING
            orbit.dEl *= 1 - ORBIT_DAMPING

            const fit = Math.min(1.7, Math.max(1, 1.45 / (camera.aspect || 1)))
            const r = orbit.radius * fit

            const cosEl = Math.cos(orbit.el)
            const sinEl = Math.sin(orbit.el)
            const sinAz = Math.sin(orbit.theta)
            const cosAz = Math.cos(orbit.theta)

            camera.position.set(r * cosEl * sinAz, r * sinEl, r * cosEl * cosAz)

            camera.up.set(-sinEl * sinAz, cosEl, -sinEl * cosAz)
            camera.lookAt(0, 0, 0)

            leanAxis.copy(camera.position).normalize()
            rig.quaternion.setFromAxisAngle(
                leanAxis,
                -paramsRef.current.lean * DEG
            )
        }

        let px = 0
        let py = 0

        const aim = new THREE.Vector2(0, 0)
        let aimed = false
        let over = false
        let hoverAmount = 0

        const onPointerDown = (e: PointerEvent) => {
            if (!paramsRef.current.camera.orbit) return
            dragging = true
            px = e.clientX
            py = e.clientY
            try {
                canvas.setPointerCapture(e.pointerId)
            } catch {}
        }

        const onPointerMove = (e: PointerEvent) => {
            aim.set(
                (e.offsetX / (sizeW || 1)) * 2 - 1,
                1 - (e.offsetY / (sizeH || 1)) * 2
            )
            aimed = true

            if (!dragging) return
            const h = container.clientHeight || 1
            orbit.dTheta -= 2 * Math.PI * ((e.clientX - px) / h) * DRAG_SPEED
            orbit.dEl += 2 * Math.PI * ((e.clientY - py) / h) * DRAG_SPEED
            px = e.clientX
            py = e.clientY
        }

        const onPointerEnter = () => {
            over = true
        }

        const onPointerLeave = () => {
            over = false
        }

        const onPointerUp = (e: PointerEvent) => {
            if (dragging) {
                dragging = false
                try {
                    canvas.releasePointerCapture(e.pointerId)
                } catch {}
            }
        }

        const onPointerCancel = () => {
            dragging = false
            over = false
        }

        const onWheel = (e: WheelEvent) => {
            if (!paramsRef.current.camera.wheel) return

            e.preventDefault()
            const step = e.deltaY > 0 ? 1.08 : 1 / 1.08
            orbit.radius = Math.min(28, Math.max(3, orbit.radius * step))
        }

        canvas.addEventListener("pointerdown", onPointerDown)
        canvas.addEventListener("pointermove", onPointerMove)
        canvas.addEventListener("pointerup", onPointerUp)
        canvas.addEventListener("pointercancel", onPointerCancel)
        canvas.addEventListener("pointerenter", onPointerEnter)
        canvas.addEventListener("pointerleave", onPointerLeave)
        canvas.addEventListener("wheel", onWheel, { passive: false })

        const parsed = { colors: "", core: "" }
        const recolour = (target: THREE.Color, css: string) => {
            try {
                target.setStyle(css)
            } catch {}
        }

        const applyParams = () => {
            const q = paramsRef.current

            const half = Math.max(0.5, q.shape.height / 2)
            uniforms.uMaxY.value = half
            uniforms.uMinY.value = -half
            uniforms.uWaist.value = Math.max(0.05, q.shape.waist)

            uniforms.uFlare.value = 12.5 / Math.max(0.3, q.shape.flare)
            uniforms.uTwist.value = q.shape.twist
            uniforms.uFlow.value = q.flow * 0.05

            uniforms.uAspect.value = camera.aspect || 1
            uniforms.uReach.value = 0.08 + q.repel * 0.056
            uniforms.uPush.value = q.repel * 0.03

            uniforms.uSize.value = q.size * 2.4 * (renderHeight / 900)

            const palette = q.colors.join("|")
            if (parsed.colors !== palette) {
                parsed.colors = palette
                for (let i = 0; i < q.colors.length; i++) {
                    recolour(uniforms.uColors.value[i], q.colors[i])
                }
                uniforms.uColorCount.value = q.colors.length
            }
            if (parsed.core !== q.core.color) {
                parsed.core = q.core.color
                recolour(coreMat.color, q.core.color)
            }
            core.visible = q.core.show

            prefilterMat.uniforms.uThreshold.value = BLOOM_THRESHOLD
            prefilterMat.uniforms.uKnee.value = BLOOM_THRESHOLD * 0.5
            upMat.uniforms.uRadius.value = BLOOM_RADIUS
            compositeMat.uniforms.uStrength.value = q.glow * 0.15
        }

        const renderFrame = (t: number, dt: number) => {
            const q = paramsRef.current
            applyParams()
            stepOrbit()

            const wanted = q.repel > 0 && over && aimed ? 1 : 0

            if (wanted && hoverAmount === 0) uniforms.uPointer.value.copy(aim)
            hoverAmount += (wanted - hoverAmount) * (1 - Math.exp(-dt * 7))
            if (hoverAmount < 0.002) hoverAmount = 0
            uniforms.uHover.value = hoverAmount
            uniforms.uPointer.value.lerp(aim, 1 - Math.exp(-dt * 16))

            uniforms.uTime.value = t

            const spin = t * 0.01 * q.spin
            uniforms.uSpin.value = spin
            stream.rotation.y = spin

            core.rotation.y = t * 0.06 * q.core.spin

            const swell = q.core.diameter / (2 * CORE_RADIUS)
            core.scale.setScalar(swell * (1 + Math.sin(t * 1.6) * 0.05))
            coreMat.size = CORE_DOT * 0.005 * swell
            coreMat.opacity = 0.9

            renderer.setRenderTarget(rtScene)
            renderer.clear(true, false, false)
            renderer.render(scene, camera)

            prefilterMat.uniforms.tDiffuse.value = rtScene.texture
            blit(prefilterMat, mips[0].rt, true)

            for (let i = 1; i < mips.length; i++) {
                const src = mips[i - 1]
                downMat.uniforms.tDiffuse.value = src.rt.texture
                downMat.uniforms.uTexel.value.set(1 / src.w, 1 / src.h)
                blit(downMat, mips[i].rt, true)
            }

            for (let i = mips.length - 1; i > 0; i--) {
                const src = mips[i]
                upMat.uniforms.tDiffuse.value = src.rt.texture
                upMat.uniforms.uTexel.value.set(1 / src.w, 1 / src.h)
                blit(upMat, mips[i - 1].rt, false)
            }

            compositeMat.uniforms.tBase.value = rtScene.texture
            compositeMat.uniforms.tBloom.value = mips[0].rt.texture
            blit(compositeMat, null, true)
        }

        let prefersReduced = false
        try {
            prefersReduced = window.matchMedia(
                "(prefers-reduced-motion: reduce)"
            ).matches
        } catch {}

        const clock = new THREE.Clock()
        let last = 0

        const loop = () => {
            if (prefersReduced) {
                if (!dirty) return
                dirty = false
                hoverAmount = 0
                renderFrame(FROZEN_TIME, 0)
                return
            }
            if (!onScreen) return

            const t = clock.getElapsedTime()
            const dt = Math.min(0.1, t - last)
            last = t
            renderFrame(t, dt)
        }

        renderer.setAnimationLoop(loop)

        apiRef.current = {
            invalidate: () => {
                dirty = true
            },
            setCloud: (count: number) => {
                const previous = stream.geometry
                stream.geometry = buildCloud(count)
                previous.dispose()
                dirty = true
            },
        }

        return () => {
            renderer.setAnimationLoop(null)
            apiRef.current = null

            ro.disconnect()
            io.disconnect()
            canvas.removeEventListener("pointerdown", onPointerDown)
            canvas.removeEventListener("pointermove", onPointerMove)
            canvas.removeEventListener("pointerup", onPointerUp)
            canvas.removeEventListener("pointercancel", onPointerCancel)
            canvas.removeEventListener("pointerenter", onPointerEnter)
            canvas.removeEventListener("pointerleave", onPointerLeave)
            canvas.removeEventListener("wheel", onWheel)

            stream.geometry.dispose()
            streamMat.dispose()
            coreGeo.dispose()
            coreMat.dispose()
            quadGeo.dispose()
            prefilterMat.dispose()
            downMat.dispose()
            upMat.dispose()
            compositeMat.dispose()
            rtScene.dispose()
            dropMips()

            renderer.dispose()
            renderer.forceContextLoss()
            canvas.remove()
        }
    }, [])

    const cloudKey = p.particles
    const builtRef = useRef(cloudKey)
    useEffect(() => {
        if (builtRef.current === cloudKey) return
        builtRef.current = cloudKey
        apiRef.current?.setCloud(cloudKey)
    }, [cloudKey])

    useEffect(() => {
        apiRef.current?.invalidate()
    })

    const cornerLight = (start: boolean): CSSProperties => ({
        position: "absolute",
        width: "55%",
        height: "55%",
        ...(start ? { left: "-18%", top: "-18%" } : { right: "-16%", bottom: "-16%" }),
        background: `radial-gradient(closest-side, ${p.colors[0]}, transparent 60%)`,
        filter: "blur(60px)",
        opacity: GLOW_OPACITY,
        mixBlendMode: "screen",
        pointerEvents: "none",
    })

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",

                touchAction: p.camera.orbit ? "none" : "auto",
                background: p.background,
                ...props.style,
            }}
        >
            <div style={cornerLight(true)} />
            <div style={cornerLight(false)} />
        </div>
    )
}
