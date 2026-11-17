/**
 * Every 3D model in the game, built from simple shapes in code: the animals, the goods, the
 * buildings, the decorations and the people. One world unit is 100 board units (a pen tile is 0.8).
 * Models stand on y = 0 and face +x (the engine's "right"); buildings face the camera (+z).
 *
 * Animals have a child named "pose" (bobbed and tilted when walking and eating) and, for the birds,
 * a "head" to peck with.
 */
import { CatmullRomCurve3, Group, TubeGeometry, Vector3 } from 'three'
import { geo, group, mat, paint, part, rng, shadows, speckle } from './kit'

export type ModelName
  = | 'chicken' | 'duck' | 'cow' | 'monkey'
    | 'egg' | 'duckegg' | 'milk' | 'cake' | 'saltegg' | 'yogurt' | 'dessert' | 'coin' | 'water'
    | 'well' | 'barn' | 'truck' | 'bakery' | 'saltjar' | 'dairy' | 'stall' | 'plot'
    | 'palm' | 'banana' | 'rice' | 'stupa' | 'flag' | 'tree' | 'bush' | 'srey' | 'ta'

const PI = Math.PI

/* ------------------------------ Textures ------------------------------ */

const wood = () => paint('wood', 128, (g, s) => {
  g.fillStyle = '#a86f3e'
  g.fillRect(0, 0, s, s)
  const r = rng(3)
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(90,50,20,.35)' : 'rgba(255,220,170,.18)'
    g.lineWidth = 1 + r() * 2
    g.beginPath()
    const y = r() * s
    g.moveTo(0, y)
    g.bezierCurveTo(s * 0.3, y + r() * 6 - 3, s * 0.7, y + r() * 6 - 3, s, y)
    g.stroke()
  }
  g.fillStyle = 'rgba(60,30,10,.4)'
  for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 2)
})

const thatch = () => paint('thatch', 128, (g, s) => {
  g.fillStyle = '#c4532d'
  g.fillRect(0, 0, s, s)
  for (let y = 0; y < s; y += 16) {
    g.fillStyle = 'rgba(80,20,8,.35)'
    g.fillRect(0, y, s, 3)
    for (let x = (y / 16) % 2 ? 0 : 12; x < s; x += 24) {
      g.fillStyle = 'rgba(255,190,150,.12)'
      g.fillRect(x, y + 3, 20, 12)
    }
  }
})

const stone = () => paint('stone', 128, (g, s) => {
  g.fillStyle = '#9aa0a4'
  g.fillRect(0, 0, s, s)
  const r = rng(9)
  for (let y = 0; y < s; y += 22) {
    for (let x = (y / 22) % 2 ? -14 : 0; x < s; x += 30) {
      g.fillStyle = `hsl(200, 6%, ${54 + r() * 14}%)`
      g.beginPath()
      g.roundRect(x + 2, y + 2, 26, 18, 5)
      g.fill()
    }
  }
})

const krama = () => paint('krama', 64, (g, s) => {
  g.fillStyle = '#d93a2b'
  g.fillRect(0, 0, s, s)
  g.fillStyle = 'rgba(255,255,255,.85)'
  for (let i = 0; i < s; i += 16) {
    g.fillRect(i, 0, 5, s)
    g.fillRect(0, i, s, 5)
  }
})

const stripes = (a: string, b: string) => paint(`stripes${a}${b}`, 64, (g, s) => {
  g.fillStyle = a
  g.fillRect(0, 0, s, s)
  g.fillStyle = b
  for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 8, s)
})

const clay = () => paint('clay', 64, (g, s) => {
  g.fillStyle = '#a8603a'
  g.fillRect(0, 0, s, s)
  speckle(g, s, 4, ['rgba(255,200,150,.18)', 'rgba(60,20,0,.18)'], 160, [0.5, 2])
  g.fillStyle = 'rgba(255,220,180,.25)'
  g.fillRect(0, s * 0.28, s, 4)
  g.fillRect(0, s * 0.62, s, 3)
})

/* ------------------------------ Animals ------------------------------ */

function chicken() {
  const root = new Group()
  const pose = group(root)
  pose.name = 'pose'
  const white = mat('#fbf7ee', { rough: 0.8 })
  const shade = mat('#ece2cf', { rough: 0.85 })
  const red = mat('#e8402f', { rough: 0.5 })
  const orange = mat('#f2a51d', { rough: 0.5 })
  for (const z of [-0.06, 0.06]) {
    part(pose, geo.cyl(0.018, 0.015, 0.17, 6), orange, [0.01, 0.085, z])
    part(pose, geo.box(0.09, 0.012, 0.05), orange, [0.04, 0.006, z])
  }
  part(pose, geo.sphere(0.2), white, [0, 0.31, 0], [0, 0, 0.18], [1.25, 1, 1])
  part(pose, geo.cone(0.11, 0.24, 12), white, [-0.25, 0.44, 0], [0, 0, 0.9], [1, 1, 0.55])
  part(pose, geo.cone(0.07, 0.18, 10), shade, [-0.27, 0.47, 0], [0, 0, 1.3], [1, 1, 0.5])
  for (const z of [-0.17, 0.17]) part(pose, geo.sphere(0.12), shade, [-0.03, 0.32, z], [0, 0, 0.25], [1.35, 0.7, 0.32])
  const head = group(pose, [0.2, 0.52, 0])
  head.name = 'head'
  part(head, geo.sphere(0.12), white, [0, 0.03, 0])
  for (const [x, y, r] of [[-0.05, 0.15, 0.04], [0, 0.17, 0.045], [0.05, 0.15, 0.04]] as const) part(head, geo.sphere(r), red, [x, y, 0], [0, 0, 0], [1, 1, 0.55])
  part(head, geo.cone(0.035, 0.1, 10), orange, [0.15, 0.02, 0], [0, 0, -PI / 2])
  part(head, geo.sphere(0.03), red, [0.1, -0.06, 0], [0, 0, 0], [0.8, 1.5, 0.7])
  for (const z of [-0.075, 0.075]) {
    part(head, geo.sphere(0.022), mat('#1e1410', { rough: 0.2 }), [0.08, 0.06, z])
    part(head, geo.sphere(0.008), mat('#ffffff'), [0.095, 0.07, z * 1.12])
  }
  return shadows(root)
}

function duck() {
  const root = new Group()
  const pose = group(root)
  pose.name = 'pose'
  const white = mat('#fdfdf8', { rough: 0.75 })
  const shade = mat('#e6e6dc', { rough: 0.8 })
  const orange = mat('#f59a1c', { rough: 0.45 })
  for (const z of [-0.07, 0.07]) {
    part(pose, geo.cyl(0.02, 0.018, 0.12, 6), orange, [0, 0.06, z])
    part(pose, geo.box(0.11, 0.012, 0.08), orange, [0.04, 0.006, z])
  }
  part(pose, geo.sphere(0.22), white, [0, 0.27, 0], [0, 0, 0.06], [1.4, 0.82, 1])
  part(pose, geo.cone(0.09, 0.18, 10), white, [-0.32, 0.33, 0], [0, 0, 1.25], [1, 1, 0.6])
  for (const z of [-0.18, 0.18]) part(pose, geo.sphere(0.14), shade, [-0.04, 0.3, z], [0, 0, 0.1], [1.45, 0.6, 0.3])
  part(pose, geo.cyl(0.07, 0.08, 0.24, 14), white, [0.22, 0.43, 0], [0, 0, -0.2])
  const head = group(pose, [0.26, 0.58, 0])
  head.name = 'head'
  part(head, geo.sphere(0.11), white)
  part(head, geo.rbox(0.17, 0.045, 0.1, 0.02), orange, [0.13, -0.02, 0], [0, 0, -0.08])
  for (const z of [-0.07, 0.07]) {
    part(head, geo.sphere(0.02), mat('#1e1410', { rough: 0.2 }), [0.05, 0.035, z])
    part(head, geo.sphere(0.007), mat('#ffffff'), [0.064, 0.044, z * 1.12])
  }
  return shadows(root)
}

function cow() {
  const root = new Group()
  const pose = group(root)
  pose.name = 'pose'
  const hide = mat('#f6efe2', { rough: 0.85 })
  const shade = mat('#e6dac6', { rough: 0.85 })
  const patch = mat('#6a4a32', { rough: 0.9 })
  const hoof = mat('#4a3a2c', { rough: 0.5 })
  for (const x of [-0.27, 0.27]) {
    for (const z of [-0.14, 0.14]) {
      part(pose, geo.cyl(0.055, 0.045, 0.46, 10), x > 0 ? hide : shade, [x, 0.27, z])
      part(pose, geo.cyl(0.05, 0.055, 0.06, 10), hoof, [x, 0.03, z])
    }
  }
  part(pose, geo.capsule(0.27, 0.5), hide, [0, 0.72, 0], [0, 0, PI / 2], [1, 1, 0.82])
  part(pose, geo.sphere(0.17), hide, [0.2, 0.98, 0], [0, 0, -0.3], [1.1, 0.85, 0.8])
  part(pose, geo.sphere(0.2), shade, [0.32, 0.55, 0], [0, 0, 0], [0.6, 0.9, 0.5])
  for (const [x, y, z, s] of [[-0.15, 0.85, 0.2, 0.15], [0.12, 0.72, -0.22, 0.13], [-0.3, 0.62, -0.18, 0.11], [0.05, 0.9, 0.12, 0.1]] as const) {
    part(pose, geo.sphere(s), patch, [x, y, z], [0, 0, 0], [1.4, 1, 0.55])
  }
  const tail = new CatmullRomCurve3([new Vector3(-0.52, 0.86, 0), new Vector3(-0.62, 0.7, 0), new Vector3(-0.6, 0.42, 0.02)])
  part(pose, new TubeGeometry(tail, 12, 0.018, 6), shade)
  part(pose, geo.sphere(0.05), mat('#6a5a44'), [-0.6, 0.38, 0.02], [0, 0, 0], [0.8, 1.4, 0.8])
  const head = group(pose, [0.56, 0.86, 0])
  head.name = 'head'
  part(head, geo.rbox(0.26, 0.3, 0.26, 0.1), hide, [0.02, 0, 0], [0, 0, -0.35])
  part(head, geo.rbox(0.2, 0.15, 0.22, 0.07), mat('#efbca8', { rough: 0.6 }), [0.15, -0.12, 0], [0, 0, -0.35])
  for (const z of [-0.06, 0.06]) part(head, geo.sphere(0.022), mat('#8a4a3a'), [0.24, -0.11, z])
  for (const z of [-1, 1]) {
    part(head, geo.sphere(0.07), hide, [-0.04, 0.06, z * 0.17], [z * 0.5, 0, 0], [0.5, 0.35, 1.2])
    part(head, geo.cone(0.03, 0.16, 8), mat('#b49a6a', { rough: 0.4 }), [-0.04, 0.2, z * 0.09], [z * 0.5, 0, 0.2])
    part(head, geo.sphere(0.025), mat('#1e1410', { rough: 0.2 }), [0.12, 0.05, z * 0.1])
    part(head, geo.sphere(0.009), mat('#ffffff'), [0.135, 0.06, z * 0.11])
  }
  return shadows(root)
}

function monkey() {
  const root = new Group()
  const pose = group(root)
  pose.name = 'pose'
  const fur = mat('#9a6438', { rough: 0.9 })
  const dark = mat('#7a4a26', { rough: 0.9 })
  const skin = mat('#f0b49a', { rough: 0.6 })
  for (const z of [-0.09, 0.09]) {
    part(pose, geo.capsule(0.05, 0.14), dark, [-0.02, 0.1, z], [0, 0, 0.5])
    part(pose, geo.sphere(0.05), skin, [0.06, 0.03, z], [0, 0, 0], [1.4, 0.6, 1])
  }
  part(pose, geo.sphere(0.18), fur, [0, 0.33, 0], [0, 0, -0.15], [1, 1.15, 0.95])
  part(pose, geo.sphere(0.12), mat('#c8946a', { rough: 0.9 }), [0.08, 0.3, 0], [0, 0, 0], [0.7, 1, 0.85])
  for (const z of [-1, 1]) part(pose, geo.capsule(0.04, 0.2), fur, [0.12, 0.38, z * 0.17], [z * 0.6, 0, -0.9])
  const tail = new CatmullRomCurve3([new Vector3(-0.15, 0.25, 0), new Vector3(-0.38, 0.32, 0), new Vector3(-0.42, 0.6, 0), new Vector3(-0.3, 0.72, 0)])
  part(pose, new TubeGeometry(tail, 20, 0.03, 8), dark)
  const head = group(pose, [0.08, 0.63, 0])
  head.name = 'head'
  part(head, geo.sphere(0.15), fur)
  for (const z of [-1, 1]) part(head, geo.sphere(0.06), skin, [-0.02, 0.02, z * 0.15], [0, 0, 0], [0.5, 1, 1])
  part(head, geo.sphere(0.11), skin, [0.08, -0.02, 0], [0, 0, 0], [0.6, 0.85, 1])
  for (const z of [-0.045, 0.045]) {
    part(head, geo.sphere(0.022), mat('#1e1410', { rough: 0.2 }), [0.15, 0.03, z])
    part(head, geo.sphere(0.008), mat('#ffffff'), [0.165, 0.04, z])
  }
  part(head, geo.torus(0.04, 0.008, PI), mat('#6e4422'), [0.15, -0.06, 0], [0, PI / 2, PI])
  return shadows(root)
}

/* ------------------------------ Goods ------------------------------ */

function egg(color: string, spots = false) {
  const root = new Group()
  part(root, geo.sphere(0.1), mat(color, { rough: 0.35 }), [0, 0.13, 0], [0, 0, 0], [1, 1.3, 1])
  if (spots) {
    const r = rng(5)
    for (let i = 0; i < 7; i++) {
      const a = r() * PI * 2
      const y = 0.06 + r() * 0.15
      part(root, geo.sphere(0.012), mat('#8fb8a4'), [Math.cos(a) * 0.098 * Math.sin(y * 20), y, Math.sin(a) * 0.098])
    }
  }
  return shadows(root)
}

function milk() {
  const root = new Group()
  part(root, geo.lathe('bottle', [[0, 0], [0.09, 0], [0.1, 0.02], [0.1, 0.2], [0.06, 0.27], [0.045, 0.3], [0.045, 0.34], [0, 0.34]]), mat('#ffffff', { rough: 0.15 }))
  part(root, geo.cyl(0.101, 0.101, 0.07, 22, true), mat('#58b4f0', { rough: 0.4, side: 'double' }), [0, 0.12, 0])
  part(root, geo.cyl(0.055, 0.055, 0.05, 16), mat('#2f7fd0', { rough: 0.4 }), [0, 0.355, 0])
  return shadows(root)
}

function cake() {
  const root = new Group()
  part(root, geo.cyl(0.19, 0.19, 0.02, 28), mat('#f4f0e8', { rough: 0.3 }), [0, 0.01, 0])
  part(root, geo.cyl(0.16, 0.16, 0.08, 28), mat('#e8b45a', { rough: 0.7 }), [0, 0.06, 0])
  part(root, geo.cyl(0.162, 0.162, 0.025, 28), mat('#fff3dc', { rough: 0.5 }), [0, 0.11, 0])
  part(root, geo.cyl(0.16, 0.16, 0.07, 28), mat('#e8b45a', { rough: 0.7 }), [0, 0.155, 0])
  part(root, geo.cyl(0.165, 0.165, 0.025, 28), mat('#fff6e6', { rough: 0.45 }), [0, 0.2, 0])
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    part(root, geo.sphere(0.026), mat('#fffaf0', { rough: 0.45 }), [Math.cos(a) * 0.13, 0.215, Math.sin(a) * 0.13])
  }
  part(root, geo.sphere(0.04), mat('#e3262a', { rough: 0.15 }), [0, 0.25, 0])
  part(root, geo.cyl(0.004, 0.004, 0.06, 4), mat('#3f8f2f'), [0.01, 0.3, 0], [0, 0, -0.4])
  return shadows(root)
}

function saltegg() {
  const root = new Group()
  part(root, geo.lathe('dish', [[0, 0], [0.16, 0], [0.2, 0.05], [0.19, 0.06], [0, 0.03]]), mat('#5aa0c8', { rough: 0.3 }))
  for (const x of [-0.06, 0.07]) {
    const half = group(root, [x, 0.06, 0], [0, x * 4, 0])
    part(half, geo.hemi(0.08), mat('#d6ece2', { rough: 0.3 }), [0, 0, 0], [PI, 0, 0], [1, 1.2, 1])
    part(half, geo.cyl(0.075, 0.075, 0.01, 20), mat('#ffffff', { rough: 0.5 }), [0, 0.003, 0])
    part(half, geo.sphere(0.04), mat('#ff8a1f', { rough: 0.35 }), [0, 0.006, 0], [0, 0, 0], [1, 0.4, 1])
  }
  return shadows(root)
}

function yogurt() {
  const root = new Group()
  part(root, geo.lathe('cup', [[0, 0], [0.09, 0], [0.12, 0.24], [0.125, 0.25], [0, 0.25]]), mat('#fffaf2', { rough: 0.35 }))
  part(root, geo.lathe('cupband', [[0.097, 0.07], [0.112, 0.17]], 28), mat('#ff8fb0', { rough: 0.4, side: 'double' }))
  part(root, geo.cyl(0.13, 0.13, 0.025, 26), mat('#ff6f98', { rough: 0.35 }), [0, 0.26, 0])
  return shadows(root)
}

function dessert() {
  const root = new Group()
  part(root, geo.cyl(0.11, 0.08, 0.06, 22), mat('#5fc85f', { rough: 0.5 }), [0, 0.06, 0])
  part(root, geo.cyl(0.125, 0.11, 0.07, 22), mat('#fff3c4', { rough: 0.5 }), [0, 0.125, 0])
  part(root, geo.cyl(0.14, 0.125, 0.07, 22), mat('#ff9a4a', { rough: 0.5 }), [0, 0.195, 0])
  part(root, geo.sphere(0.12), mat('#ffffff', { rough: 0.6 }), [0, 0.24, 0], [0, 0, 0], [1, 0.45, 1])
  part(root, geo.lathe('glass', [[0, 0], [0.08, 0], [0.085, 0.02], [0.15, 0.27], [0.155, 0.28]]), mat('#d8f2ff', { rough: 0.05, opacity: 0.38 }))
  part(root, geo.sphere(0.035), mat('#e3262a', { rough: 0.15 }), [0.03, 0.29, 0.02])
  part(root, geo.cyl(0.012, 0.012, 0.3, 8), mat('#ff5a7a', { rough: 0.4 }), [-0.05, 0.36, 0], [0, 0, 0.35])
  part(root, geo.cyl(0.07, 0.07, 0.012, 16), mat('#ffffff', { rough: 0.2 }), [0, 0.003, 0])
  return shadows(root)
}

function coin() {
  const root = new Group()
  const gold = mat('#ffcf3a', { rough: 0.3, metal: 0.25 })
  part(root, geo.cyl(0.2, 0.2, 0.05, 32), gold, [0, 0.2, 0], [PI / 2, 0, 0])
  part(root, geo.torus(0.2, 0.018), mat('#f0b000', { rough: 0.3, metal: 0.3 }), [0, 0.2, 0])
  const star: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + (i / 10) * PI * 2
    const r = i % 2 ? 0.05 : 0.12
    star.push([Math.cos(a) * r, -Math.sin(a) * r])
  }
  part(root, geo.shape('star', star, 0.07, 0.006), mat('#fff0a0', { rough: 0.3, metal: 0.2 }), [0, 0.2, 0])
  return shadows(root)
}

function water() {
  const root = new Group()
  // A rounded bottom, then a taper to the tip.
  const r = 0.12
  const h = 0.36
  const pts: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * (PI / 2)
    pts.push([r * Math.sin(t), r - r * Math.cos(t)])
  }
  for (let i = 1; i <= 10; i++) {
    const y = r + ((h - r) * i) / 10
    pts.push([r * (1 - (y - r) / (h - r)) ** 1.3, y])
  }
  part(root, geo.lathe('drop', pts), mat('#3fb4f0', { rough: 0.05, metal: 0.1 }))
  part(root, geo.sphere(0.03), mat('#ffffff', { rough: 0.1 }), [-0.04, 0.12, 0.08], [0, 0, 0], [0.7, 1.2, 0.5])
  return shadows(root)
}

/* ------------------------------ Buildings ------------------------------ */

function well() {
  const root = new Group()
  const stoneMat = mat('#ffffff', { rough: 0.9, map: stone() })
  const woodMat = mat('#ffffff', { rough: 0.8, map: wood() })
  part(root, geo.cyl(0.52, 0.56, 0.48, 28, true), mat('#ffffff', { rough: 0.9, map: stone(), side: 'double' }), [0, 0.24, 0])
  part(root, geo.torus(0.52, 0.06), stoneMat, [0, 0.48, 0], [PI / 2, 0, 0])
  part(root, geo.cyl(0.48, 0.48, 0.02, 28), mat('#2f9fd8', { rough: 0.05, metal: 0.2 }), [0, 0.38, 0])
  for (const x of [-0.5, 0.5]) part(root, geo.rbox(0.1, 1.15, 0.1, 0.02), woodMat, [x, 0.6, 0])
  part(root, geo.cyl(0.035, 0.035, 1.12, 10), mat('#5e3a1e'), [0, 0.98, 0], [0, 0, PI / 2])
  part(root, geo.cyl(0.006, 0.006, 0.36, 4), mat('#d9c08a'), [0, 0.8, 0])
  part(root, geo.cyl(0.07, 0.055, 0.1, 12), woodMat, [0, 0.6, 0])
  part(root, geo.cone(0.82, 0.55, 4), mat('#ffffff', { rough: 0.7, map: thatch() }), [0, 1.42, 0], [0, PI / 4, 0])
  part(root, geo.sphere(0.06), mat('#ffd23f', { rough: 0.3, metal: 0.4 }), [0, 1.72, 0])
  return shadows(root)
}

function barn() {
  const root = new Group()
  const woodMat = mat('#ffffff', { rough: 0.8, map: wood() })
  const post = mat('#6a4026', { rough: 0.85 })
  for (const x of [-0.8, -0.27, 0.27, 0.8]) for (const z of [-0.45, 0.45]) part(root, geo.cyl(0.05, 0.06, 0.62, 10), post, [x, 0.31, z])
  part(root, geo.rbox(1.95, 0.1, 1.15, 0.02), mat('#8a5a34', { rough: 0.85 }), [0, 0.66, 0])
  part(root, geo.box(1.75, 0.66, 0.95), woodMat, [0, 1.04, 0])
  part(root, geo.gableWall(1.75, 0.95, 0.42), woodMat, [0, 1.37, 0])
  part(root, geo.rbox(0.36, 0.5, 0.04, 0.02), mat('#5a3420', { rough: 0.7 }), [0, 0.97, 0.48])
  part(root, geo.sphere(0.02), mat('#e8c070', { metal: 0.6, rough: 0.3 }), [0.12, 0.98, 0.51])
  for (const x of [-0.55, 0.55]) {
    part(root, geo.rbox(0.32, 0.24, 0.04, 0.02), mat('#3a2414', { rough: 0.6 }), [x, 1.1, 0.48])
    part(root, geo.box(0.03, 0.26, 0.05), woodMat, [x, 1.1, 0.49])
  }
  part(root, geo.gable(2.05, 1.3, 0.62, 0.08), mat('#ffffff', { rough: 0.7, map: thatch(), side: 'double' }), [0, 1.3, 0])
  // The roof's upswept tips, as on Khmer houses.
  for (const x of [-1.03, 1.03]) part(root, geo.cone(0.05, 0.34, 8), mat('#7a2e18'), [x, 2.02, 0], [0, 0, x > 0 ? -0.75 : 0.75])
  part(root, geo.box(2.05, 0.06, 0.06), mat('#7a2e18'), [0, 1.91, 0])
  // Ladder.
  const ladder = group(root, [0.62, 0, 0.66], [-0.32, 0, 0])
  for (const x of [-0.12, 0.12]) part(ladder, geo.box(0.04, 0.78, 0.04), post, [x, 0.38, 0])
  for (let y = 0.12; y < 0.75; y += 0.16) part(ladder, geo.box(0.24, 0.03, 0.03), post, [0, y, 0])
  // Sacks by the door.
  for (const [x, z] of [[-0.95, 0.62], [-0.78, 0.7]] as const) part(root, geo.sphere(0.13), mat('#d9c08a', { rough: 1 }), [x, 0.12, z], [0, 0, 0], [1, 1.1, 0.9])
  return shadows(root)
}

function truck() {
  const root = new Group()
  const blue = mat('#2f8fd0', { rough: 0.35, metal: 0.2 })
  const dark = mat('#1a4a78', { rough: 0.4 })
  const tyre = mat('#2a2a2e', { rough: 0.85 })
  const rim = mat('#d0d4d8', { rough: 0.3, metal: 0.7 })
  const wheel = (x: number, z: number, r: number) => {
    const w = group(root, [x, r, z], [PI / 2, 0, 0])
    w.name = 'wheel'
    part(w, geo.torus(r * 0.75, r * 0.28), tyre)
    part(w, geo.cyl(r * 0.5, r * 0.5, 0.06, 14), rim, [0, 0, 0], [PI / 2, 0, 0])
  }
  // The carriage.
  part(root, geo.rbox(1.1, 0.12, 0.82, 0.03), dark, [-0.3, 0.3, 0])
  part(root, geo.rbox(1.1, 0.34, 0.06, 0.02), blue, [-0.3, 0.52, 0.39])
  part(root, geo.rbox(1.1, 0.34, 0.06, 0.02), blue, [-0.3, 0.52, -0.39])
  part(root, geo.rbox(0.06, 0.34, 0.82, 0.02), blue, [-0.84, 0.52, 0])
  part(root, geo.rbox(0.95, 0.1, 0.7, 0.03), mat('#c4402c', { rough: 0.6 }), [-0.3, 0.42, 0])
  for (const x of [-0.82, 0.22]) for (const z of [-0.38, 0.38]) part(root, geo.cyl(0.02, 0.02, 0.5, 6), rim, [x, 0.9, z])
  part(root, geo.vault(0.47, 1.2), mat('#ffffff', { rough: 0.55, map: stripes('#ffd23f', '#ff9a1a'), side: 'double' }), [-0.3, 1.15, 0], [0, 0, 0], [1, 0.45, 1])
  for (let i = 0; i < 9; i++) for (const z of [-0.47, 0.47]) part(root, geo.sphere(0.035), mat('#e8402f'), [-0.86 + i * 0.14, 1.12, z])
  wheel(-0.3, 0.45, 0.2)
  wheel(-0.3, -0.45, 0.2)
  part(root, geo.box(0.36, 0.04, 0.04), rim, [0.42, 0.34, 0])
  // The motorbike pulling it.
  const bike = group(root, [0.82, 0, 0])
  part(bike, geo.capsule(0.11, 0.3), mat('#e8402f', { rough: 0.3, metal: 0.25 }), [0, 0.46, 0], [0, 0, PI / 2 + 0.25])
  part(bike, geo.rbox(0.3, 0.06, 0.14, 0.03), mat('#2a2a2e'), [-0.08, 0.58, 0])
  part(bike, geo.cyl(0.02, 0.02, 0.42, 6), rim, [0.2, 0.62, 0], [0, 0, -0.35])
  part(bike, geo.cyl(0.015, 0.015, 0.36, 6), mat('#2a2a2e'), [0.27, 0.82, 0], [PI / 2, 0, 0])
  part(bike, geo.sphere(0.04), mat('#fff6c8', { emissive: '#fff2a0', emissiveIntensity: 0.6 }), [0.31, 0.72, 0])
  const w1 = group(bike, [0.32, 0.18, 0], [PI / 2, 0, 0])
  w1.name = 'wheel'
  part(w1, geo.torus(0.14, 0.05), tyre)
  part(w1, geo.cyl(0.08, 0.08, 0.05, 12), rim, [0, 0, 0], [PI / 2, 0, 0])
  const w2 = group(bike, [-0.22, 0.18, 0], [PI / 2, 0, 0])
  w2.name = 'wheel'
  part(w2, geo.torus(0.14, 0.05), tyre)
  part(w2, geo.cyl(0.08, 0.08, 0.05, 12), rim, [0, 0, 0], [PI / 2, 0, 0])
  // The driver.
  part(bike, geo.capsule(0.11, 0.16), mat('#ffd23f', { rough: 0.7 }), [-0.06, 0.8, 0])
  part(bike, geo.sphere(0.1), mat('#d9a070', { rough: 0.6 }), [-0.04, 1.06, 0])
  part(bike, geo.hemi(0.115), mat('#2f8fd0', { rough: 0.3 }), [-0.04, 1.08, 0])
  for (const z of [-0.07, 0.07]) part(bike, geo.capsule(0.035, 0.18), mat('#d9a070'), [0.12, 0.84, z], [0, 0, -1.1])
  return shadows(root)
}

function bakery() {
  const root = new Group()
  const walls = mat('#f2d6a8', { rough: 0.9 })
  part(root, geo.rbox(1.3, 0.72, 0.95, 0.03), walls, [0, 0.36, -0.1])
  part(root, geo.gableWall(1.3, 0.95, 0.42), walls, [0, 0.72, -0.1])
  part(root, geo.gable(1.6, 1.3, 0.6, 0.07), mat('#ffffff', { rough: 0.7, map: thatch(), side: 'double' }), [0, 0.68, -0.1])
  part(root, geo.rbox(0.18, 0.45, 0.18, 0.02), mat('#8a4a2a', { rough: 0.9 }), [0.38, 1.25, -0.25])
  // The clay oven, in front.
  part(root, geo.hemi(0.34), mat('#c4643a', { rough: 0.95 }), [-0.22, 0, 0.42], [0, 0, 0], [1, 1.05, 1])
  part(root, geo.cyl(0.13, 0.13, 0.1, 18, false), mat('#3a1a0a'), [-0.22, 0.12, 0.72], [PI / 2, 0, 0], [1, 1, 1])
  part(root, geo.sphere(0.08), mat('#ffb040', { emissive: '#ff8a1a', emissiveIntensity: 1.2 }), [-0.22, 0.08, 0.68], [0, 0, 0], [1, 0.6, 0.5])
  part(root, geo.rbox(0.42, 0.06, 0.32, 0.02), mat('#a86f3e'), [0.35, 0.36, 0.55])
  part(root, geo.box(0.06, 0.34, 0.06), mat('#6a4026'), [0.2, 0.17, 0.55])
  part(root, geo.box(0.06, 0.34, 0.06), mat('#6a4026'), [0.5, 0.17, 0.55])
  part(root, geo.cyl(0.11, 0.11, 0.08, 20), mat('#e8b45a'), [0.35, 0.43, 0.55])
  part(root, geo.cyl(0.112, 0.112, 0.02, 20), mat('#fff6e6'), [0.35, 0.47, 0.55])
  return shadows(root)
}

function saltjar() {
  const root = new Group()
  const woodMat = mat('#6a4026', { rough: 0.85 })
  for (const x of [-0.7, 0.7]) for (const z of [-0.4, 0.4]) part(root, geo.cyl(0.04, 0.04, 1.0, 8), woodMat, [x, 0.5, z])
  part(root, geo.gable(1.7, 1.15, 0.5, 0.06), mat('#3aa0a0', { rough: 0.6, side: 'double' }), [0, 0.98, 0])
  const jar = (x: number, z: number, s: number) => {
    const j = group(root, [x, 0, z], [0, 0, 0], s)
    part(j, geo.lathe('jar', [[0, 0], [0.18, 0], [0.3, 0.12], [0.33, 0.3], [0.26, 0.5], [0.17, 0.56], [0.19, 0.6], [0.16, 0.62], [0, 0.6]], 28), mat('#ffffff', { rough: 0.75, map: clay() }))
    part(j, geo.cyl(0.16, 0.16, 0.02, 20), mat('#f8f8f8', { rough: 1 }), [0, 0.61, 0])
  }
  jar(-0.28, 0.05, 1)
  jar(0.32, 0.2, 0.75)
  jar(0.2, -0.25, 0.6)
  for (let i = 0; i < 5; i++) part(root, geo.sphere(0.03), mat('#d6ece2', { rough: 0.3 }), [0.55 - i * 0.05, 0.03, 0.5 - (i % 2) * 0.06], [0, 0, 0], [1, 1.3, 1])
  return shadows(root)
}

function dairy() {
  const root = new Group()
  const walls = mat('#fbfbf8', { rough: 0.85 })
  part(root, geo.rbox(1.35, 0.75, 0.95, 0.03), walls, [0, 0.375, -0.1])
  part(root, geo.box(1.36, 0.06, 0.96), mat('#d8e2e8'), [0, 0.22, -0.1])
  part(root, geo.gableWall(1.35, 0.95, 0.45), walls, [0, 0.75, -0.1])
  part(root, geo.gable(1.65, 1.35, 0.62, 0.07), mat('#3a78c8', { rough: 0.5, side: 'double' }), [0, 0.71, -0.1])
  part(root, geo.rbox(0.38, 0.58, 0.04, 0.02), mat('#8cbcf0', { rough: 0.5 }), [-0.2, 0.29, 0.38])
  for (const r of [0.98, -0.98]) part(root, geo.box(0.035, 0.66, 0.05), mat('#3a78c8'), [-0.2, 0.29, 0.41], [0, 0, r * 0.55])
  // Milk churns.
  for (const [x, s] of [[0.35, 1], [0.58, 0.8]] as const) {
    const c = group(root, [x, 0, 0.5], [0, 0, 0], s)
    part(c, geo.lathe('churn', [[0, 0], [0.14, 0], [0.15, 0.3], [0.09, 0.4], [0.08, 0.46], [0, 0.46]], 22), mat('#c8d2d8', { rough: 0.25, metal: 0.7 }))
    part(c, geo.torus(0.05, 0.012), mat('#8a9aa6', { metal: 0.6, rough: 0.3 }), [0, 0.5, 0])
  }
  return shadows(root)
}

function stall() {
  const root = new Group()
  part(root, geo.rbox(1.25, 0.5, 0.65, 0.04), mat('#ffffff', { rough: 0.6, map: stripes('#ffe9a8', '#ffcf5a') }), [0, 0.42, 0])
  part(root, geo.rbox(1.35, 0.07, 0.75, 0.03), mat('#c98a3e', { rough: 0.6 }), [0, 0.7, 0])
  for (const x of [-0.45, 0.45]) {
    const w = group(root, [x, 0.14, 0.33], [PI / 2, 0, 0])
    part(w, geo.torus(0.11, 0.035), mat('#6a4026'))
  }
  part(root, geo.cyl(0.025, 0.025, 1.0, 8), mat('#6a4026'), [0, 1.2, 0])
  const umb = group(root, [0, 1.65, 0])
  part(umb, geo.cone(0.95, 0.38, 16), mat('#ffffff', { rough: 0.55, map: stripes('#ff6a90', '#ffe0e8'), side: 'double' }), [0, 0, 0])
  part(umb, geo.sphere(0.05), mat('#ffd23f', { metal: 0.4, rough: 0.3 }), [0, 0.22, 0])
  // Glasses of dessert on the counter.
  const colors = ['#ff9a4a', '#5fc85f', '#ff7aa0', '#fff3c4']
  colors.forEach((c, i) => {
    part(root, geo.cyl(0.07, 0.05, 0.14, 14), mat(c, { rough: 0.4 }), [-0.42 + i * 0.28, 0.81, 0.1])
    part(root, geo.sphere(0.06), mat('#ffffff', { rough: 0.6 }), [-0.42 + i * 0.28, 0.89, 0.1], [0, 0, 0], [1, 0.5, 1])
  })
  return shadows(root)
}

function plot() {
  const root = new Group()
  part(root, geo.rbox(1.4, 0.06, 1.0, 0.03), mat('#9a7048', { rough: 1 }), [0, 0.03, 0])
  for (const [x, z] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]] as const) part(root, geo.cyl(0.03, 0.035, 0.3, 6), mat('#c8a070'), [x, 0.15, z])
  part(root, geo.box(1.2, 0.02, 0.02), mat('#ff9a3a'), [0, 0.26, 0.4])
  part(root, geo.box(1.2, 0.02, 0.02), mat('#ff9a3a'), [0, 0.26, -0.4])
  part(root, geo.box(0.06, 0.6, 0.06), mat('#7a4d2a'), [0, 0.3, 0.1])
  part(root, geo.rbox(0.62, 0.34, 0.05, 0.04), mat('#ffffff', { rough: 0.8, map: wood() }), [0, 0.62, 0.14])
  // A hammer and a pile of planks.
  part(root, geo.box(0.5, 0.04, 0.12), mat('#c8a070'), [-0.35, 0.08, -0.15], [0, 0.3, 0])
  part(root, geo.box(0.5, 0.04, 0.12), mat('#b08858'), [-0.33, 0.12, -0.14], [0, 0.1, 0])
  part(root, geo.box(0.04, 0.04, 0.28), mat('#6a4026'), [0.42, 0.08, -0.2], [0, 0.6, 0])
  part(root, geo.box(0.14, 0.08, 0.07), mat('#8a9aa6', { metal: 0.6, rough: 0.3 }), [0.5, 0.1, -0.31], [0, 0.6, 0])
  return shadows(root)
}

/* ------------------------------ Around the farm ------------------------------ */

function palm() {
  const root = new Group()
  const trunk = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.05, 1, 0), new Vector3(-0.02, 2, 0.02), new Vector3(0, 2.7, 0)])
  part(root, new TubeGeometry(trunk, 16, 0.09, 10), mat('#7a5a3a', { rough: 1 }))
  for (let i = 0; i < 7; i++) part(root, geo.torus(0.095, 0.015), mat('#5e4428', { rough: 1 }), [0.02, 0.3 + i * 0.33, 0], [PI / 2, 0, 0])
  const leaf = mat('#3f9a3a', { rough: 0.7, side: 'double' })
  const fan: [number, number][] = [[0, 0]]
  for (let i = 0; i <= 14; i++) {
    const a = -1.1 + (i / 14) * 2.2
    const r = i % 2 ? 0.62 : 0.72
    fan.push([Math.sin(a) * r, Math.cos(a) * r])
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2
    const f = group(root, [0, 2.7, 0], [0, a, 0])
    part(f, geo.shape('palmfan', fan, 0.01), leaf, [0, 0, 0], [-0.9 - (i % 3) * 0.25, 0, 0])
  }
  for (const [x, z] of [[0.1, 0.06], [-0.06, 0.1], [0.02, -0.1]] as const) part(root, geo.sphere(0.08), mat('#3a2a1a', { rough: 0.6 }), [x, 2.6, z])
  return shadows(root, false)
}

function banana() {
  const root = new Group()
  part(root, geo.cyl(0.09, 0.13, 1.3, 12), mat('#86b03e', { rough: 0.8 }), [0, 0.65, 0])
  const leafMat = mat('#5fbf4a', { rough: 0.6, side: 'double' })
  const leaf: [number, number][] = [[0, 0], [0.18, 0.2], [0.24, 0.6], [0.16, 1.0], [0, 1.15], [-0.16, 1.0], [-0.24, 0.6], [-0.18, 0.2]]
  for (let i = 0; i < 7; i++) {
    const g = group(root, [0, 1.25, 0], [0, (i / 7) * PI * 2, 0])
    part(g, geo.shape('banana', leaf, 0.01), leafMat, [0, 0, 0], [-0.7 - (i % 2) * 0.5, 0, 0])
  }
  for (let i = 0; i < 6; i++) part(root, geo.capsule(0.03, 0.1), mat('#ffd23f', { rough: 0.5 }), [0.12, 0.9 - i * 0.05, (i % 3) * 0.04 - 0.04], [0.3, 0, 0.5])
  return shadows(root, false)
}

function rice() {
  const root = new Group()
  const r = rng(11)
  const green = mat('#7cc044', { rough: 0.7 })
  const gold = mat('#e8c84a', { rough: 0.6 })
  for (let i = 0; i < 9; i++) {
    const a = r() * PI * 2
    const tilt = 0.15 + r() * 0.25
    const h = 0.35 + r() * 0.2
    const blade = group(root, [Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt])
    part(blade, geo.cone(0.014, h, 5), green, [0, h / 2, 0])
    if (i % 2) part(blade, geo.capsule(0.018, 0.06), gold, [0.02, h - 0.02, 0], [0, 0, 0.6])
  }
  return shadows(root, false)
}

function stupa() {
  const root = new Group()
  const sand = mat('#d4b078', { rough: 0.95 })
  const sand2 = mat('#c9a46a', { rough: 0.95 })
  part(root, geo.rbox(0.9, 0.36, 0.9, 0.03), sand2, [0, 0.18, 0])
  part(root, geo.rbox(0.7, 0.32, 0.7, 0.03), sand, [0, 0.52, 0])
  part(root, geo.rbox(0.52, 0.28, 0.52, 0.03), sand2, [0, 0.82, 0])
  part(root, geo.lathe('spire', [[0, 0], [0.24, 0], [0.22, 0.2], [0.16, 0.42], [0.08, 0.62], [0.02, 0.78], [0, 0.82]], 4), sand, [0, 0.96, 0], [0, PI / 4, 0])
  part(root, geo.rbox(0.18, 0.28, 0.04, 0.03), mat('#5a4024'), [0, 0.14, 0.46])
  return shadows(root)
}

function flag() {
  const root = new Group()
  part(root, geo.shape('pennant', [[-0.12, 0], [0.12, 0], [0, -0.22]], 0.01), mat('#ff6a90', { rough: 0.6, side: 'double' }))
  return root
}

function tree() {
  const root = new Group()
  part(root, geo.cyl(0.1, 0.14, 0.9, 10), mat('#6a4a2a', { rough: 1 }), [0, 0.45, 0])
  const leaf = mat('#3f8f3a', { rough: 0.85 })
  const light = mat('#58a84a', { rough: 0.85 })
  for (const [x, y, z, s] of [[0, 1.15, 0, 0.55], [0.32, 0.95, 0.1, 0.38], [-0.32, 0.98, -0.05, 0.4], [0.05, 1.5, 0.05, 0.38], [0, 1.0, 0.3, 0.36]] as const) {
    part(root, geo.sphere(1, 14, 10), s > 0.5 ? leaf : light, [x, y, z], [0, 0, 0], s)
  }
  return shadows(root, false)
}

function bush() {
  const root = new Group()
  const leaf = mat('#4a9a3a', { rough: 0.85 })
  const light = mat('#62b24c', { rough: 0.85 })
  for (const [x, y, z, s] of [[0, 0.2, 0, 0.3], [0.25, 0.16, 0.05, 0.22], [-0.24, 0.17, 0.02, 0.23]] as const) part(root, geo.sphere(1, 12, 9), x ? light : leaf, [x, y, z], [0, 0, 0], s)
  for (const [x, z] of [[0.05, 0.28], [-0.15, 0.22], [0.2, 0.2]] as const) part(root, geo.sphere(0.035), mat('#ff6a90', { rough: 0.5 }), [x, 0.3, z])
  return shadows(root, false)
}

/* ------------------------------ People ------------------------------ */

function person(old: boolean) {
  const root = new Group()
  const skin = mat(old ? '#c98a5a' : '#e8b080', { rough: 0.6 })
  part(root, geo.capsule(0.2, 0.22), mat(old ? '#f4f4ec' : '#3aa0d0', { rough: 0.8 }), [0, 0.32, 0], [0, 0, 0], [0.85, 1, 1.3])
  part(root, geo.cyl(0.07, 0.08, 0.1, 12), skin, [0, 0.62, 0])
  if (old) part(root, geo.box(0.12, 0.62, 0.17), mat('#ffffff', { rough: 0.8, map: krama() }), [0.06, 0.38, 0], [0, 0, 0.6])
  else part(root, geo.torus(0.1, 0.045), mat('#ffffff', { rough: 0.8, map: krama() }), [0, 0.6, 0], [PI / 2, 0, 0])
  for (const z of [-1, 1]) {
    part(root, geo.capsule(0.06, 0.24), mat(old ? '#ececdf' : '#3290c0', { rough: 0.8 }), [0.04, 0.38, z * 0.25], [z * 0.25, 0, -0.25])
    part(root, geo.sphere(0.06), skin, [0.1, 0.22, z * 0.29])
  }
  const head = group(root, [0, 0.86, 0], [0, 0, 0], 1.12)
  part(head, geo.sphere(0.19), skin, [0, 0, 0])
  for (const z of [-1, 1]) part(head, geo.sphere(0.045), skin, [-0.02, 0, z * 0.18], [0, 0, 0], [0.6, 1, 0.6])
  for (const z of [-0.07, 0.07]) {
    part(head, geo.sphere(0.024), mat('#2a1a10', { rough: 0.2 }), [0.17, 0.02, z])
    part(head, geo.sphere(0.008), mat('#ffffff'), [0.188, 0.03, z * 1.05])
    part(head, geo.sphere(0.03), mat('#ff8f7a', { rough: 0.7 }), [0.14, -0.06, z * 1.8], [0, 0, 0], [0.5, 0.6, 0.8])
  }
  part(head, geo.torus(0.05, 0.01, PI), mat('#8a3a2a'), [0.18, -0.07, 0], [0, PI / 2, PI])
  if (old) {
    part(head, geo.hemi(0.195), mat('#ececec', { rough: 0.9 }), [-0.03, 0.03, 0], [0, 0, 0.5])
    part(head, geo.capsule(0.022, 0.12), mat('#ececec', { rough: 0.9 }), [0.18, -0.035, 0], [PI / 2, 0, 0])
  }
  else {
    part(head, geo.hemi(0.2), mat('#2a1a10', { rough: 0.5 }), [-0.02, 0.02, 0], [0, 0, 0.35])
    part(head, geo.capsule(0.06, 0.2), mat('#2a1a10', { rough: 0.5 }), [-0.2, -0.12, 0], [0, 0, 0.25])
    part(head, geo.cyl(0.36, 0.36, 0.02, 26), mat('#e8c870', { rough: 0.8 }), [0, 0.15, 0])
    part(head, geo.cone(0.2, 0.16, 22), mat('#f2d68a', { rough: 0.8 }), [0, 0.24, 0])
    part(head, geo.cyl(0.2, 0.2, 0.025, 22, true), mat('#e8402f', { side: 'double' }), [0, 0.18, 0])
  }
  return shadows(root)
}

/* ------------------------------ The catalogue ------------------------------ */

const MAKERS: Record<ModelName, () => Group> = {
  chicken, duck, cow, monkey,
  egg: () => egg('#fff1d8'),
  duckegg: () => egg('#d6ece2', true),
  milk, cake, saltegg, yogurt, dessert, coin, water,
  well, barn, truck, bakery, saltjar, dairy, stall, plot,
  palm, banana, rice, stupa, flag, tree, bush,
  srey: () => person(false),
  ta: () => person(true),
}

/** A fresh copy of a model (geometry and materials are shared). */
export function makeModel(name: ModelName): Group {
  const g = MAKERS[name]()
  g.name = name
  return g
}
