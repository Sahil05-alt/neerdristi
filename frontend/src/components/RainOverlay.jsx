import { useEffect, useRef } from 'react'

const MAX_DROPS = 200

export default function RainOverlay({ rainMmHr = 0 }) {
    const canvasRef = useRef(null)
    const rafRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')

        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (prefersReduced || rainMmHr <= 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            cancelAnimationFrame(rafRef.current)
            return
        }

        const intensity = Math.min(rainMmHr / 80, 1)
        const dropCount = Math.floor(15 + intensity * (MAX_DROPS - 15))
        const dropSpeed = 3 + intensity * 10
        const dropOpacity = 0.12 + intensity * 0.25
        const dropLength = 8 + intensity * 12

        function resize() {
            canvas.width = canvas.offsetWidth
            canvas.height = canvas.offsetHeight
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(canvas)

        const drops = Array.from({ length: dropCount }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            speed: dropSpeed * (0.7 + Math.random() * 0.6),
        }))

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.strokeStyle = `rgba(147,197,253,${dropOpacity})`
            ctx.lineWidth = 1
            ctx.lineCap = 'round'
            ctx.beginPath()
            for (const d of drops) {
                ctx.moveTo(d.x, d.y)
                ctx.lineTo(d.x - dropLength * 0.15, d.y + dropLength)
                d.y += d.speed
                if (d.y > canvas.height) {
                    d.y = -dropLength
                    d.x = Math.random() * canvas.width
                }
            }
            ctx.stroke()
            rafRef.current = requestAnimationFrame(draw)
        }

        rafRef.current = requestAnimationFrame(draw)

        return () => {
            cancelAnimationFrame(rafRef.current)
            ro.disconnect()
            ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
    }, [rainMmHr])

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 500,
                borderRadius: 'inherit',
            }}
            aria-hidden="true"
        />
    )
}
