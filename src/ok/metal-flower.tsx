"use client"

import * as React from "react"
import { useEffect, useRef } from "react"
import * as THREE from "three"

const PERSPECTIVE = 0.15

const PETAL_SEGMENTS_LENGTH = 14
const PETAL_SEGMENTS_WIDTH = 7

const MAX_ROWS = 5

const DRAG_SENSITIVITY = 0.008

const MAX_TURN = Math.PI / 3

const DEFAULTS = {
    tint: "#FFFFFF",
    petals: 16,
    rows: 3,
    length: 20,
    width: 1,
    curl: 0,
    cup: 5,
    open: 0,
    core: 20,
    stem: 20,
    stemWidth: 20,
    spin: 4,
    sizePercent: 200,
}

type Config = {
    tint: string
    petals: number
    rows: number
    length: number
    width: number
    curl: number
    cup: number
    open: number
    core: number
    stem: number
    stemWidth: number
    spin: number
    sizePercent: number
}

function clamp(v: number, lo: number, hi: number, fallback: number): number {
    const n = typeof v === "number" && isFinite(v) ? v : fallback
    return Math.max(lo, Math.min(hi, n))
}

const rowLift = (open: number, t: number) => open * (1 - 0.45 * t)
const rowShrink = (t: number) => 1 + t * 0.35
const rowRise = (length: number, t: number) => -t * length * 0.16

function settingsFor(cfg: Config) {
    const length = 0.45 + clamp(cfg.length, 1, 20, DEFAULTS.length) * 0.055
    const curl = length * clamp(cfg.curl, 0, 20, DEFAULTS.curl) * 0.055
    const open = clamp(cfg.open, 0, 20, DEFAULTS.open) * 0.06
    const stemWidth =
        length * (0.008 + clamp(cfg.stemWidth, 1, 20, DEFAULTS.stemWidth) * 0.0035)

    const core = length * (0.08 + clamp(cfg.core, 0, 20, DEFAULTS.core) * 0.012)
    const rows = Math.round(clamp(cfg.rows, 1, MAX_ROWS, DEFAULTS.rows))
    const petals = Math.round(clamp(cfg.petals, 3, 16, DEFAULTS.petals))
    const sway = clamp(cfg.spin, 0, 20, DEFAULTS.spin) * 0.0175

    let curlBack = 0
    let petalDrop = 0
    let rowsBack = 0
    for (let r = 0; r < rows; r++) {
        const t = rows > 1 ? r / (rows - 1) : 0
        const lift = Math.max(0, rowLift(open, t) - sway)
        curlBack = Math.max(curlBack, rowShrink(t) * curl * Math.cos(lift))
        petalDrop = Math.max(petalDrop, rowShrink(t) * length * Math.cos(lift))

        rowsBack = Math.max(rowsBack, -rowRise(length, t))
    }

    const stemStart = Math.min(rowsBack, core * 0.7)
    const stemBack = stemStart + curlBack + stemWidth * 1.6

    return {
        petals,

        rows,
        length,

        width: length * (0.16 + clamp(cfg.width, 1, 5, DEFAULTS.width) * 0.026),

        curl,

        cup: clamp(cfg.cup, 0, 20, DEFAULTS.cup) * 0.022,

        open,

        core,

        stem: length * clamp(cfg.stem, 0, 20, DEFAULTS.stem) * 0.16,

        stemWidth,
        stemBack,
        stemStart,

        stemDrop: petalDrop,

        sway,

        rollSway: Math.min(sway * 0.35, ((Math.PI * 2) / petals) * 0.28),
        sizePercent: clamp(cfg.sizePercent, 20, 200, DEFAULTS.sizePercent),
    }
}

// Ewha adaptation: the upstream component loads a polished-metal matcap from
// framerusercontent.com. We paint a pearl matcap on a canvas instead, so the
// flower has no external dependency and reads as porcelain rather than chrome.
let matcapTexture: THREE.Texture | null = null

function loadMatcap(): Promise<THREE.Texture | null> {
    if (matcapTexture) return Promise.resolve(matcapTexture)
    const S = 256
    const c = document.createElement("canvas")
    c.width = c.height = S
    const g = c.getContext("2d")
    if (!g) return Promise.resolve(null)
    const body = g.createRadialGradient(S * 0.42, S * 0.36, S * 0.02, S * 0.5, S * 0.5, S * 0.5)
    body.addColorStop(0, "#ffffff")
    body.addColorStop(0.35, "#eef1ea")
    body.addColorStop(0.7, "#a9b8ae")
    body.addColorStop(0.9, "#2f4a3c")
    body.addColorStop(1, "#0d1f16")
    g.fillStyle = body
    g.fillRect(0, 0, S, S)
    const rim = g.createRadialGradient(S * 0.5, S * 0.5, S * 0.38, S * 0.5, S * 0.5, S * 0.5)
    rim.addColorStop(0, "rgba(255,255,255,0)")
    rim.addColorStop(0.85, "rgba(196,236,212,0.0)")
    rim.addColorStop(0.96, "rgba(196,236,212,0.55)")
    rim.addColorStop(1, "rgba(196,236,212,0)")
    g.fillStyle = rim
    g.fillRect(0, 0, S, S)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    matcapTexture = t
    return Promise.resolve(t)
}

function buildStem(
    length: number,
    radius: number,
    start: number,
    back: number,
    drop: number
): THREE.BufferGeometry {
    const rings = 24
    const sides = 12
    const positions: number[] = []
    const indices: number[] = []

    for (let i = 0; i <= rings; i++) {
        const f = i / rings
        const y = -f * length

        const k = Math.min(1, (f * length) / Math.max(drop, 0.0001))
        const z = -(start + (back - start) * k * k)

        const r = radius * (1 - 0.38 * f)

        for (let j = 0; j <= sides; j++) {
            const a = (j / sides) * Math.PI * 2
            positions.push(Math.cos(a) * r, y, z + Math.sin(a) * r)
        }
    }

    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < sides; j++) {
            const a = i * (sides + 1) + j
            const b = a + sides + 1
            indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
}

function buildPetal(
    length: number,
    width: number,
    curl: number,
    cup: number
): THREE.BufferGeometry {
    const nu = PETAL_SEGMENTS_LENGTH
    const nv = PETAL_SEGMENTS_WIDTH
    const positions: number[] = []
    const indices: number[] = []

    for (let iu = 0; iu <= nu; iu++) {
        const u = iu / nu

        const halfWidth = width * Math.pow(Math.sin(Math.PI * u), 0.72)

        const bend = -curl * u * u

        for (let iv = 0; iv <= nv; iv++) {
            const v = (iv / nv) * 2 - 1
            positions.push(
                v * halfWidth,
                u * length,
                bend + cup * v * v * length
            )
        }
    }

    for (let iu = 0; iu < nu; iu++) {
        for (let iv = 0; iv < nv; iv++) {
            const a = iu * (nv + 1) + iv
            const b = a + nv + 1
            indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)

    geo.computeVertexNormals()
    return geo
}

class FlowerScene {
    private container: HTMLElement
    private cfg: Config

    private renderer: THREE.WebGLRenderer
    private scene = new THREE.Scene()
    private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000)
    private group = new THREE.Group()

    private material: THREE.MeshMatcapMaterial
    private petalGeometry: THREE.BufferGeometry | null = null
    private coreGeometry: THREE.SphereGeometry | null = null
    private petalMesh: THREE.InstancedMesh | null = null
    private coreMesh: THREE.Mesh | null = null
    private stemGeometry: THREE.BufferGeometry | null = null
    private stemMesh: THREE.Mesh | null = null

    private matrix = new THREE.Matrix4()
    private quat = new THREE.Quaternion()
    private spinQuat = new THREE.Quaternion()
    private euler = new THREE.Euler()
    private scaleVec = new THREE.Vector3()
    private posVec = new THREE.Vector3()
    private zAxis = new THREE.Vector3(0, 0, 1)

    private swayTime = 0
    private dragX = 0
    private dragY = 0
    private velX = 0
    private velY = 0
    private isDragging = false
    private lastX = 0
    private lastY = 0

    private width = 1
    private height = 1
    private frameId = 0
    private lastT = 0
    private disposed = false

    constructor(container: HTMLElement, cfg: Config) {
        this.container = container
        this.cfg = cfg

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.setClearColor(0x000000, 0)
        const el = this.renderer.domElement
        el.style.position = "absolute"
        el.style.inset = "0"
        el.style.width = "100%"
        el.style.height = "100%"
        el.style.cursor = "grab"
        el.style.touchAction = "none"
        container.appendChild(el)

        this.material = new THREE.MeshMatcapMaterial({
            color: new THREE.Color(cfg.tint || DEFAULTS.tint),

            side: THREE.DoubleSide,
        })

        this.scene.add(this.group)
        this.build()

        loadMatcap().then((t) => {
            if (this.disposed || !t) return
            this.material.matcap = t
            this.material.needsUpdate = true
        })

        el.addEventListener("pointerdown", this.onPointerDown)
        window.addEventListener("pointermove", this.onPointerMove)
        window.addEventListener("pointerup", this.onPointerUp)
        window.addEventListener("pointercancel", this.onPointerUp)
    }

    private build() {
        const S = settingsFor(this.cfg)

        this.petalMesh?.dispose()
        if (this.petalMesh) this.group.remove(this.petalMesh)
        this.petalGeometry?.dispose()
        this.coreGeometry?.dispose()
        if (this.coreMesh) this.group.remove(this.coreMesh)
        this.stemGeometry?.dispose()
        if (this.stemMesh) this.group.remove(this.stemMesh)

        this.petalGeometry = buildPetal(S.length, S.width, S.curl, S.cup)

        const count = S.petals * S.rows
        const mesh = new THREE.InstancedMesh(this.petalGeometry, this.material, count)

        mesh.frustumCulled = false

        this.petalMesh = mesh
        this.placePetals()
        this.group.add(mesh)

        this.coreGeometry = new THREE.SphereGeometry(S.core, 24, 16)
        this.coreMesh = new THREE.Mesh(this.coreGeometry, this.material)
        this.coreMesh.position.set(0, 0, 0)
        this.group.add(this.coreMesh)

        if (S.stem > 0.001) {
            this.stemGeometry = buildStem(
                S.stem,
                S.stemWidth,
                S.stemStart,
                S.stemBack,
                S.stemDrop
            )
            this.stemMesh = new THREE.Mesh(this.stemGeometry, this.material)
            this.group.add(this.stemMesh)
        }
    }

    private placePetals() {
        const mesh = this.petalMesh
        if (!mesh) return
        const S = settingsFor(this.cfg)

        let i = 0
        for (let row = 0; row < S.rows; row++) {
            const t = S.rows > 1 ? row / (S.rows - 1) : 0

            const shrink = rowShrink(t)
            const lift = rowLift(S.open, t)

            const twist = (row * Math.PI) / S.petals

            for (let p = 0; p < S.petals; p++) {
                const around = (p / S.petals) * Math.PI * 2 + twist

                const wobble = Math.sin(this.swayTime + around)

                this.euler.set(lift + wobble * S.sway, 0, 0)
                this.quat.setFromEuler(this.euler)

                this.spinQuat.setFromAxisAngle(
                    this.zAxis,
                    around + wobble * S.rollSway
                )
                this.quat.premultiply(this.spinQuat)

                this.scaleVec.setScalar(shrink)

                this.posVec.set(0, 0, rowRise(S.length, t))

                this.matrix.compose(this.posVec, this.quat, this.scaleVec)
                mesh.setMatrixAt(i, this.matrix)
                i++
            }
        }
        mesh.instanceMatrix.needsUpdate = true
    }

    private onPointerDown = (e: PointerEvent) => {
        this.isDragging = true
        this.lastX = e.clientX
        this.lastY = e.clientY
        this.renderer.domElement.style.cursor = "grabbing"
    }

    private onPointerMove = (e: PointerEvent) => {
        if (!this.isDragging) return
        const dx = e.clientX - this.lastX
        const dy = e.clientY - this.lastY
        this.lastX = e.clientX
        this.lastY = e.clientY
        this.dragY += dx * DRAG_SENSITIVITY
        this.dragX += dy * DRAG_SENSITIVITY

        this.velY = dx * DRAG_SENSITIVITY
        this.velX = dy * DRAG_SENSITIVITY
    }

    private onPointerUp = () => {
        if (!this.isDragging) return
        this.isDragging = false
        this.renderer.domElement.style.cursor = "grab"
    }

    start() {
        this.lastT = performance.now()
        const loop = () => {
            this.frameId = requestAnimationFrame(loop)
            this.step()
        }
        loop()
    }

    setSize(width: number, height: number) {
        if (this.disposed || width <= 0 || height <= 0) return
        this.renderer.setSize(width, height, false)
        this.width = width
        this.height = height
        this.updateCamera()
    }

    private updateCamera() {
        const aspect = Math.max(1, this.width) / Math.max(1, this.height)
        const distance = 1 / PERSPECTIVE
        const S = settingsFor(this.cfg)

        const reach = Math.max(
            S.length * rowShrink(1) + S.core,
            (S.length + S.stem) * 0.62,

            S.length + S.stemBack
        )
        const span = reach * 2.7 * (100 / S.sizePercent)
        const visibleHeight = aspect < 1 ? span / aspect : span

        this.camera.aspect = aspect
        this.camera.position.set(0, 0, distance)
        this.camera.lookAt(0, 0, 0)
        this.camera.fov =
            2 * Math.atan(visibleHeight / 2 / distance) * (180 / Math.PI)
        this.camera.near = Math.max(0.1, distance - 20)
        this.camera.far = distance + 20
        this.camera.updateProjectionMatrix()
    }

    updateConfig(cfg: Config) {
        if (this.disposed) return
        const prev = this.cfg
        this.cfg = cfg
        this.material.color.set(cfg.tint || DEFAULTS.tint)

        const shapeChanged =
            cfg.petals !== prev.petals ||
            cfg.rows !== prev.rows ||
            cfg.length !== prev.length ||
            cfg.width !== prev.width ||
            cfg.curl !== prev.curl ||
            cfg.cup !== prev.cup ||
            cfg.open !== prev.open ||
            cfg.core !== prev.core ||
            cfg.stem !== prev.stem ||
            cfg.stemWidth !== prev.stemWidth ||
            cfg.spin !== prev.spin
        if (shapeChanged) this.build()
        this.updateCamera()
    }

    private step() {
        if (this.disposed) return
        const now = performance.now()
        let dt = (now - this.lastT) / 1000
        this.lastT = now
        if (!isFinite(dt) || dt < 0) dt = 0

        if (dt > 0.05) dt = 0.05

        const S = settingsFor(this.cfg)

        if (!this.isDragging) {
            const decay = Math.exp(-dt * 3)
            this.dragY += this.velY
            this.dragX += this.velX
            this.velX *= decay
            this.velY *= decay
        }

        if (S.sway > 0.0001) {
            this.swayTime += dt * 1.1

            this.placePetals()
        }

        this.group.rotation.y = clamp(this.dragY, -MAX_TURN, MAX_TURN, 0)
        this.group.rotation.x = clamp(this.dragX * 0.5, -MAX_TURN, MAX_TURN, 0)

        this.renderer.render(this.scene, this.camera)
    }

    dispose() {
        this.disposed = true
        cancelAnimationFrame(this.frameId)
        const el = this.renderer.domElement
        el.removeEventListener("pointerdown", this.onPointerDown)
        window.removeEventListener("pointermove", this.onPointerMove)
        window.removeEventListener("pointerup", this.onPointerUp)
        window.removeEventListener("pointercancel", this.onPointerUp)
        this.petalMesh?.dispose()
        this.petalGeometry?.dispose()
        this.coreGeometry?.dispose()
        this.stemGeometry?.dispose()
        this.material.dispose()
        this.renderer.dispose()

        if (el.parentNode === this.container) this.container.removeChild(el)
    }
}

export interface MetalFlowerProps {
    tint?: string
    petals?: number
    rows?: number
    length?: number
    width?: number
    curl?: number
    cup?: number
    open?: number
    core?: number
    stem?: number
    stemWidth?: number
    spin?: number
    sizePercent?: number
    style?: React.CSSProperties
}

export default function MetalFlower(props: MetalFlowerProps) {
    const {
        tint = DEFAULTS.tint,
        petals = DEFAULTS.petals,
        rows = DEFAULTS.rows,
        length = DEFAULTS.length,
        width = DEFAULTS.width,
        curl = DEFAULTS.curl,
        cup = DEFAULTS.cup,
        open = DEFAULTS.open,
        core = DEFAULTS.core,
        stem = DEFAULTS.stem,
        stemWidth = DEFAULTS.stemWidth,
        spin = DEFAULTS.spin,
        sizePercent = DEFAULTS.sizePercent,
        style,
    } = props

    const containerRef = useRef<HTMLDivElement | null>(null)
    const sceneRef = useRef<FlowerScene | null>(null)

    const cfgRef = useRef<Config>(null as any)
    cfgRef.current = {
        tint,
        petals,
        rows,
        length,
        width,
        curl,
        cup,
        open,
        core,
        stem,
        stemWidth,
        spin,
        sizePercent,
    }

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        let scene: FlowerScene
        try {
            scene = new FlowerScene(container, cfgRef.current)
        } catch {
            return
        }
        sceneRef.current = scene
        scene.setSize(container.clientWidth, container.clientHeight)
        scene.start()

        const ro = new ResizeObserver(() => {
            scene.setSize(container.clientWidth, container.clientHeight)
        })
        ro.observe(container)
        return () => {
            ro.disconnect()
            scene.dispose()
            sceneRef.current = null
        }
    }, [])

    useEffect(() => {
        sceneRef.current?.updateConfig(cfgRef.current)
    }, [
        tint,
        petals,
        rows,
        length,
        width,
        curl,
        cup,
        open,
        core,
        stem,
        stemWidth,
        spin,
        sizePercent,
    ])

    return (
        <div
            ref={containerRef}
            role="img"
            aria-label="A porcelain pear blossom, turning and draggable"
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                minWidth: 120,
                minHeight: 120,
                overflow: "hidden",
                ...style,
            }}
        />
    )
}

MetalFlower.displayName = "Metal Flower"
