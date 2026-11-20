const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, QR_DIR } = require('../config');

const CATEGORIAS = [
  { nombre: 'Fundamentos', slug: 'fundamentos', icono: '🧭', descripcion: 'Lógica, algoritmos y bases para empezar con buen pie.' },
  { nombre: 'Frontend', slug: 'frontend', icono: '🎨', descripcion: 'HTML, CSS, JavaScript, React, TypeScript y accesibilidad.' },
  { nombre: 'Backend', slug: 'backend', icono: '⚙️', descripcion: 'APIs, servidores, arquitectura y servicios web.' },
  { nombre: 'Bases de Datos', slug: 'bases-datos', icono: '🗄️', descripcion: 'SQL, NoSQL, modelado y optimización de consultas.' },
  { nombre: 'DevOps y Cloud', slug: 'devops-cloud', icono: '☁️', descripcion: 'Docker, CI/CD, despliegues y plataformas cloud.' },
  { nombre: 'Desarrollo Móvil', slug: 'movil', icono: '📱', descripcion: 'Aplicaciones móviles multiplataforma y nativas.' },
  { nombre: 'Datos e IA', slug: 'datos-ia', icono: '🤖', descripcion: 'Análisis de datos, machine learning e IA generativa.' },
  { nombre: 'Testing y Calidad', slug: 'testing-calidad', icono: '✅', descripcion: 'Pruebas automatizadas, calidad y confiabilidad.' },
  { nombre: 'Ciberseguridad', slug: 'ciberseguridad', icono: '🛡️', descripcion: 'Seguridad web, buenas prácticas y OWASP.' },
  { nombre: 'Herramientas', slug: 'herramientas', icono: '🧰', descripcion: 'Git, editores, terminal y productividad para devs.' }
];

const METODOS_PAGO = [
  { nombre: 'Tarjeta de crédito o débito', slug: 'tarjeta', descripcion: 'Visa, Mastercard y Amex · confirmación inmediata.', orden: 1 },
  { nombre: 'Transferencia bancaria', slug: 'transferencia', descripcion: 'Transfiere a la cuenta del instructor y adjunta tu referencia.', orden: 2 },
  { nombre: 'Pago por QR', slug: 'qr', descripcion: 'Escanea el código QR del instructor desde tu app bancaria.', orden: 3 },
  { nombre: 'PayPal', slug: 'paypal', descripcion: 'Paga con tu saldo o cuenta de PayPal.', orden: 4 }
];

const YT = {
  logica: 'zOjov-2OZ0E',
  git: 'RGOj5yH7evk',
  html: 'pQN-pnXPaVg',
  css: '1Rs2ND1ryYc',
  js: 'PkZNo7MFNFg',
  react: 'bMknfKXIFA8',
  ts: 'd56mG7DezGs',
  node: 'Oe421EPjeBE',
  python: 'rfscVS0vtbw',
  fastapi: 'tLKKmouUams',
  sql: 'HXV3zeQKqGY',
  mongo: 'ofme2o29ngU',
  docker: '3c-iBn73dDE',
  actions: 'R8_veQiYBjI',
  flutter: '1ukSR1GRtMU',
  datascience: 'r-uOLxNrNk8',
  ia: 'aircAruvnKk',
  testing: '7r4xVDI2vho',
  security: 'ciG5Q8d5l6o',
  architecture: '8bZh5LMaSmE'
};

const CURSOS = [
  {
    slug: 'logica-de-programacion-desde-cero', titulo: 'Lógica de programación desde cero',
    categoria: 'fundamentos', nivel: 'principiante', precio: 19.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Aprende a pensar como programador con ejercicios prácticos y proyectos guiados.',
    descripcion: 'Un curso pensado para quienes empiezan desde cero. Trabajarás variables, condicionales, bucles, funciones y estructuras de datos mientras construyes pequeños programas y resuelves retos.',
    video: 'logica',
    secciones: [
      ['Pensar en pasos', ['Qué es un algoritmo', 'Variables y tipos de datos', 'Tu primer programa']],
      ['Control de flujo', ['Condicionales', 'Bucles y repetición', 'Proyecto: agenda de tareas']]
    ]
  },
  {
    slug: 'git-y-github-esencial', titulo: 'Git y GitHub esencial',
    categoria: 'herramientas', nivel: 'principiante', precio: 24.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Domina el control de versiones y colabora en proyectos reales sin miedo.',
    descripcion: 'Desde tu primer commit hasta pull requests, ramas y resolución de conflictos. Aprenderás el flujo profesional que usan los equipos de desarrollo.',
    video: 'git',
    secciones: [
      ['Primeros pasos con Git', ['Instalación y configuración', 'Commits y historial', 'Ramas']],
      ['Colaboración en GitHub', ['Repositorios remotos', 'Pull requests', 'Conflictos y buenas prácticas']]
    ]
  },
  {
    slug: 'html-y-css-moderno', titulo: 'HTML y CSS moderno',
    categoria: 'frontend', nivel: 'principiante', precio: 29.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Construye interfaces limpias, responsive y accesibles desde los cimientos.',
    descripcion: 'Aprende HTML semántico, CSS moderno, Flexbox, Grid, variables, responsive design y accesibilidad. Terminarás con una landing page completa.',
    video: 'html',
    secciones: [
      ['Estructura y estilos', ['HTML semántico', 'CSS: selectores y cascada', 'Tipografía y color']],
      ['Layout y responsive', ['Flexbox', 'CSS Grid', 'Proyecto: landing responsive']]
    ]
  },
  {
    slug: 'javascript-moderno', titulo: 'JavaScript moderno: ES2024',
    categoria: 'frontend', nivel: 'intermedio', precio: 39.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Del DOM a async/await con patrones actuales y código mantenible.',
    descripcion: 'Un recorrido práctico por el JavaScript que se usa hoy: módulos, funciones, arrays, objetos, asincronía, fetch y manejo de errores.',
    video: 'js',
    secciones: [
      ['Fundamentos modernos', ['let, const y scope', 'Arrays y objetos', 'Funciones y módulos']],
      ['Asincronía y navegador', ['Promesas y async/await', 'Fetch API', 'Proyecto: dashboard de datos']]
    ]
  },
  {
    slug: 'react-desde-cero', titulo: 'React desde cero',
    categoria: 'frontend', nivel: 'intermedio', precio: 49.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Componentes, estado y hooks construyendo una aplicación real paso a paso.',
    descripcion: 'Aprende React con Vite, componentes, props, estado, efectos, formularios y consumo de APIs. Incluye un proyecto final de gestión de tareas.',
    video: 'react',
    secciones: [
      ['Componentes y estado', ['Proyecto con Vite', 'Componentes y props', 'Estado y eventos']],
      ['Hooks y datos', ['useEffect y ciclo de vida', 'Formularios controlados', 'Proyecto: gestor de tareas']]
    ]
  },
  {
    slug: 'typescript-practico', titulo: 'TypeScript práctico',
    categoria: 'frontend', nivel: 'intermedio', precio: 34.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Tipado estático sin complicaciones para proyectos JavaScript reales.',
    descripcion: 'Introducción al sistema de tipos, interfaces, genéricos, narrowing y configuración. Migra un proyecto JavaScript a TypeScript con confianza.',
    video: 'ts',
    secciones: [
      ['El sistema de tipos', ['Por qué TypeScript', 'Tipos e interfaces', 'Funciones tipadas']],
      ['TypeScript en proyectos', ['Genéricos', 'Narrowing y utilidades', 'Migrar un proyecto JS']]
    ]
  },
  {
    slug: 'node-express-apis-rest', titulo: 'Node.js y Express: APIs REST',
    categoria: 'backend', nivel: 'intermedio', precio: 44.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Diseña, construye y documenta APIs REST listas para producción.',
    descripcion: 'Rutas, middlewares, validación, autenticación, bases de datos y manejo de errores. Construirás una API completa con Node.js y Express.',
    video: 'node',
    secciones: [
      ['Fundamentos de una API', ['Node.js y módulos', 'Express y rutas', 'Middlewares']],
      ['API lista para producción', ['Validación de datos', 'Autenticación con sesiones', 'Proyecto: API de cursos']]
    ]
  },
  {
    slug: 'python-fastapi-backend', titulo: 'Python para backend con FastAPI',
    categoria: 'backend', nivel: 'intermedio', precio: 39.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'APIs rápidas y tipadas con Python moderno, Pydantic y FastAPI.',
    descripcion: 'Aprende a crear servicios web con FastAPI, validación con Pydantic, dependencias, autenticación y documentación automática.',
    video: 'fastapi',
    secciones: [
      ['FastAPI esencial', ['Entorno y primer endpoint', 'Modelos con Pydantic', 'Rutas y parámetros']],
      ['Servicios completos', ['Dependencias', 'Autenticación', 'Proyecto: API de tareas']]
    ]
  },
  {
    slug: 'sql-y-modelado-relacional', titulo: 'SQL y modelado relacional',
    categoria: 'bases-datos', nivel: 'principiante', precio: 29.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Consulta y diseña bases de datos relacionales con criterio profesional.',
    descripcion: 'Desde SELECT hasta joins, subconsultas, índices y normalización. Practicarás con SQLite y aprenderás a modelar datos sin dolores de cabeza.',
    video: 'sql',
    secciones: [
      ['Consultas esenciales', ['Tablas y SELECT', 'Filtros y orden', 'Joins']],
      ['Diseño de datos', ['Normalización', 'Claves e índices', 'Proyecto: base de datos de cursos']]
    ]
  },
  {
    slug: 'mongodb-practico', titulo: 'MongoDB práctico',
    categoria: 'bases-datos', nivel: 'intermedio', precio: 34.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Modela, consulta y escala datos documentales con MongoDB.',
    descripcion: 'Colecciones, documentos, consultas, agregaciones, índices y modelado. Incluye conexión desde Node.js.',
    video: 'mongo',
    secciones: [
      ['Documentos y consultas', ['Instalación y shell', 'CRUD de documentos', 'Consultas avanzadas']],
      ['Agregaciones y Node.js', ['Pipeline de agregación', 'Índices', 'Proyecto: API con MongoDB']]
    ]
  },
  {
    slug: 'docker-y-contenedores', titulo: 'Docker y contenedores',
    categoria: 'devops-cloud', nivel: 'intermedio', precio: 39.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Empaqueta tus aplicaciones y ejecútalas igual en cualquier entorno.',
    descripcion: 'Imágenes, Dockerfile, volúmenes, redes, Docker Compose y despliegue. Aprende a contenerizar una aplicación real.',
    video: 'docker',
    secciones: [
      ['Docker esencial', ['Contenedores e imágenes', 'Tu primer Dockerfile', 'Volúmenes y redes']],
      ['Compose y despliegue', ['Docker Compose', 'Variables y secretos', 'Proyecto: app contenerizada']]
    ]
  },
  {
    slug: 'github-actions-cicd', titulo: 'CI/CD con GitHub Actions',
    categoria: 'devops-cloud', nivel: 'avanzado', precio: 44.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Automatiza pruebas, builds y despliegues directamente desde GitHub.',
    descripcion: 'Workflows, jobs, matrices, cache, secretos y despliegues. Diseña un pipeline completo para tu proyecto.',
    video: 'actions',
    secciones: [
      ['Primeros workflows', ['Anatomía de un workflow', 'Jobs y steps', 'Ejecutar tests']],
      ['Pipelines profesionales', ['Secretos y entornos', 'Matrices y cache', 'Proyecto: deploy automatizado']]
    ]
  },
  {
    slug: 'flutter-desde-cero', titulo: 'Flutter desde cero',
    categoria: 'movil', nivel: 'principiante', precio: 34.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Crea aplicaciones móviles multiplataforma con Dart y Flutter.',
    descripcion: 'Widgets, layout, navegación, estado y consumo de APIs. Desarrollarás tu primera app móvil completa.',
    video: 'flutter',
    secciones: [
      ['Flutter esencial', ['Instalación y primer proyecto', 'Widgets y layout', 'Navegación']],
      ['Datos y estado', ['Estado en Flutter', 'Consumo de APIs', 'Proyecto: app de notas']]
    ]
  },
  {
    slug: 'python-ciencia-de-datos', titulo: 'Python para ciencia de datos',
    categoria: 'datos-ia', nivel: 'intermedio', precio: 49.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Analiza datos reales con Pandas, NumPy y visualizaciones claras.',
    descripcion: 'Limpieza de datos, análisis exploratorio, visualización y primeros modelos. Un puente práctico entre Python y la toma de decisiones.',
    video: 'datascience',
    secciones: [
      ['Datos con Python', ['NumPy y Pandas', 'Limpieza de datos', 'Análisis exploratorio']],
      ['Visualización y modelos', ['Gráficos efectivos', 'Introducción a scikit-learn', 'Proyecto: informe de datos']]
    ]
  },
  {
    slug: 'ia-generativa-fundamentos', titulo: 'Fundamentos de IA generativa',
    categoria: 'datos-ia', nivel: 'principiante', precio: 39.99, instructor: 'ana', estado: 'aprobado',
    resumen: 'Entiende cómo funcionan los modelos generativos y cómo usarlos con criterio.',
    descripcion: 'Conceptos clave de IA generativa, prompt engineering, riesgos, evaluación y aplicaciones prácticas para desarrolladores.',
    video: 'ia',
    secciones: [
      ['Cómo funciona la IA generativa', ['Modelos y tokens', 'Entrenamiento e inferencia', 'Límites y sesgos']],
      ['Uso práctico y responsable', ['Prompt engineering', 'Evaluar respuestas', 'Proyecto: asistente documentado']]
    ]
  },
  {
    slug: 'testing-jest-playwright', titulo: 'Testing con Jest y Playwright',
    categoria: 'testing-calidad', nivel: 'intermedio', precio: 34.99, instructor: 'diego', estado: 'aprobado',
    resumen: 'Pruebas unitarias y end-to-end para dormir tranquilo al desplegar.',
    descripcion: 'Diseña pruebas mantenibles, mocks, cobertura y pruebas E2E con Playwright. Integra todo en tu pipeline.',
    video: 'testing',
    secciones: [
      ['Pruebas unitarias', ['Qué y cómo testear', 'Jest esencial', 'Mocks y cobertura']],
      ['Pruebas end-to-end', ['Playwright esencial', 'Selectores robustos', 'Proyecto: suite E2E']]
    ]
  },
  {
    slug: 'seguridad-web-owasp', titulo: 'Seguridad web: OWASP Top 10',
    categoria: 'ciberseguridad', nivel: 'avanzado', precio: 54.99, instructor: 'elena', estado: 'pendiente',
    resumen: 'Identifica y mitiga las vulnerabilidades más comunes en aplicaciones web.',
    descripcion: 'Inyecciones, XSS, control de acceso, autenticación y configuración segura. Practica con ejemplos y checklist de auditoría.',
    video: 'security',
    secciones: [
      ['Vulnerabilidades comunes', ['Inyección SQL', 'XSS y CSRF', 'Control de acceso']],
      ['Defensa en profundidad', ['Autenticación segura', 'Cabeceras y configuración', 'Checklist de auditoría']]
    ]
  },
  {
    slug: 'arquitectura-de-software-limpia', titulo: 'Arquitectura de software limpia',
    categoria: 'herramientas', nivel: 'avanzado', precio: 59.99, instructor: 'mateo', estado: 'rechazado',
    resumen: 'Diseña sistemas mantenibles separando responsabilidades y dependencias.',
    descripcion: 'Capas, límites, casos de uso, inyección de dependencias y patrones. Ejemplos aplicados a proyectos Node.js.',
    video: 'architecture',
    secciones: [
      ['Principios de diseño', ['Acoplamiento y cohesión', 'Capas y límites', 'Casos de uso']],
      ['Arquitectura aplicada', ['Inyección de dependencias', 'Testing de arquitectura', 'Proyecto: refactor guiado']]
    ]
  },
  {
    slug: 'microservicios-con-node', titulo: 'Microservicios con Node.js',
    categoria: 'backend', nivel: 'avanzado', precio: 64.99, instructor: 'elena', estado: 'borrador',
    resumen: 'Divide y vencerás: servicios pequeños, comunicación clara y observabilidad.',
    descripcion: 'Diseño de servicios, contratos, mensajería, tolerancia a fallos y despliegue. Un curso para equipos que crecen.',
    video: 'node',
    secciones: [
      ['Diseño de servicios', ['Cuándo usar microservicios', 'Contratos y APIs', 'Comunicación asíncrona']],
      ['Operación', ['Observabilidad', 'Tolerancia a fallos', 'Proyecto: sistema distribuido']]
    ]
  },
  {
    slug: 'accesibilidad-web', titulo: 'Accesibilidad web desde la práctica',
    categoria: 'frontend', nivel: 'intermedio', precio: 29.99, instructor: 'ana', estado: 'pendiente',
    resumen: 'Construye experiencias que todas las personas puedan usar.',
    descripcion: 'Semántica, teclado, contraste, lectores de pantalla, ARIA y pruebas de accesibilidad. Mejora tus interfaces sin sacrificar diseño.',
    video: 'html',
    secciones: [
      ['Bases de accesibilidad', ['Semántica y estructura', 'Navegación por teclado', 'Color y contraste']],
      ['Accesibilidad avanzada', ['ARIA con criterio', 'Lectores de pantalla', 'Auditoría de una interfaz']]
    ]
  }
];

const INSTRUCTORES = [
  {
    key: 'ana', nombre: 'Ana', apellidos: 'Torres', email: 'ana@devstore.com',
    titular: 'Desarrolladora full-stack y formadora', especialidad: 'Frontend, Node.js y bases de datos',
    anios: 9, pais: 'España', github: 'https://github.com/ana-torres',
    portafolio: 'https://anatorres.dev', linkedin: 'https://linkedin.com/in/ana-torres',
    bio: 'Ingeniera de software con experiencia en producto y educación. Me gusta explicar lo complejo con proyectos pequeños y reales.',
    credenciales: 'Certificación AWS Cloud Practitioner; 9 años de experiencia profesional.',
    estado: 'verificado'
  },
  {
    key: 'diego', nombre: 'Diego', apellidos: 'Soto', email: 'diego@devstore.com',
    titular: 'Ingeniero backend y especialista en datos', especialidad: 'Python, APIs y ciencia de datos',
    anios: 7, pais: 'México', github: 'https://github.com/diego-soto',
    portafolio: 'https://diegosoto.dev', linkedin: 'https://linkedin.com/in/diego-soto',
    bio: 'Trabajo construyendo servicios y pipelines de datos. Disfruto enseñar con ejemplos que se pueden llevar a producción.',
    credenciales: 'Máster en ciencia de datos; portafolio con proyectos open source.',
    estado: 'verificado'
  },
  {
    key: 'elena', nombre: 'Elena', apellidos: 'Ruiz', email: 'elena@devstore.com',
    titular: 'Consultora de seguridad y arquitectura', especialidad: 'Ciberseguridad y microservicios',
    anios: 11, pais: 'Argentina', github: 'https://github.com/elena-ruiz',
    portafolio: null, linkedin: 'https://linkedin.com/in/elena-ruiz',
    bio: 'Ayudo a equipos a diseñar sistemas seguros y mantenibles. Certificada en seguridad ofensiva y defensiva.',
    credenciales: 'OSCP, CISSP; conferencista en seguridad web.',
    estado: 'pendiente'
  },
  {
    key: 'mateo', nombre: 'Mateo', apellidos: 'Gil', email: 'mateo@devstore.com',
    titular: 'Arquitecto de software', especialidad: 'Arquitectura y patrones',
    anios: 12, pais: 'Chile', github: null, portafolio: 'https://mateogil.dev', linkedin: null,
    bio: 'Arquitecto con experiencia en sistemas de alta escala. Busco compartir decisiones de diseño con contexto.',
    credenciales: 'Portafolio profesional con casos de estudio.',
    estado: 'rechazado'
  }
];

const CLIENTES = [
  {
    key: 'carla', nombre: 'Carla', apellidos: 'Méndez', email: 'carla@devstore.com',
    telefono: '+34 600 123 456', pais: 'España', ciudad: 'Madrid',
    nivel: 'principiante', areas: ['frontend', 'backend']
  },
  {
    key: 'luis', nombre: 'Luis', apellidos: 'Paredes', email: 'luis@devstore.com',
    telefono: '+52 55 1234 5678', pais: 'México', ciudad: 'Ciudad de México',
    nivel: 'intermedio', areas: ['backend', 'datos-ia', 'devops-cloud']
  }
];

const COMPRAS_DEMO = [
  { cliente: 'carla', cursos: ['react-desde-cero', 'node-express-apis-rest', 'sql-y-modelado-relacional'], metodo: 'tarjeta', dias: 3 },
  { cliente: 'luis', cursos: ['python-fastapi-backend', 'docker-y-contenedores'], metodo: 'paypal', dias: 6 },
  { cliente: 'carla', cursos: ['html-y-css-moderno'], metodo: 'paypal', dias: 35 },
  { cliente: 'carla', cursos: ['javascript-moderno'], metodo: 'tarjeta', dias: 65 },
  { cliente: 'carla', cursos: ['typescript-practico'], metodo: 'transferencia', dias: 95 },
  { cliente: 'carla', cursos: ['testing-jest-playwright'], metodo: 'tarjeta', dias: 125 },
  { cliente: 'luis', cursos: ['logica-de-programacion-desde-cero'], metodo: 'tarjeta', dias: 35 },
  { cliente: 'luis', cursos: ['git-y-github-esencial'], metodo: 'transferencia', dias: 70 },
  { cliente: 'luis', cursos: ['mongodb-practico'], metodo: 'paypal', dias: 100 },
  { cliente: 'luis', cursos: ['ia-generativa-fundamentos'], metodo: 'tarjeta', dias: 130 },
  { cliente: 'luis', cursos: ['flutter-desde-cero'], metodo: 'tarjeta', dias: 160 },
  { cliente: 'carla', cursos: ['python-fastapi-backend'], metodo: 'qr', dias: 20 },
  { cliente: 'luis', cursos: ['node-express-apis-rest'], metodo: 'qr', dias: 45 }
];

function slugify(texto) {
  return texto
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function insertarCategorias(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO categorias(nombre,slug,descripcion,icono,orden) VALUES(?,?,?,?,?)');
  CATEGORIAS.forEach((c, i) => insert.run(c.nombre, c.slug, c.descripcion, c.icono, i));
}

function insertarMetodosPago(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO metodos_pago(nombre,slug,descripcion,activo,orden) VALUES(?,?,?,1,?)');
  METODOS_PAGO.forEach(m => insert.run(m.nombre, m.slug, m.descripcion, m.orden));
}

function asegurarAdmin(db) {
  const existe = db.prepare("SELECT id FROM usuarios WHERE rol='administrador' LIMIT 1").get();
  if (existe) return existe.id;
  const r = db.prepare('INSERT INTO usuarios(nombre,apellidos,email,password_hash,rol) VALUES(?,?,?,?,?)')
    .run('Equipo', 'DevStore', 'admin@devstore.com', bcrypt.hashSync('Admin123!', 10), 'administrador');
  return Number(r.lastInsertRowid);
}

function seedBase(db) {
  insertarCategorias(db);
  insertarMetodosPago(db);
  asegurarAdmin(db);
}

function crearInstructor(db, data) {
  const hash = bcrypt.hashSync('Demo1234!', 10);
  const r = db.prepare('INSERT INTO usuarios(nombre,apellidos,email,password_hash,rol) VALUES(?,?,?,?,?)')
    .run(data.nombre, data.apellidos, data.email, hash, 'instructor');
  const id = Number(r.lastInsertRowid);
  db.prepare(`INSERT INTO perfiles_instructor
    (usuario_id,titular,biografia,especialidad,anios_experiencia,pais,telefono,github_url,portafolio_url,linkedin_url,credenciales,estado_verificacion,motivo_rechazo,verificado_por,verificado_en)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, data.titular, data.bio, data.especialidad, data.anios, data.pais, null,
      data.github, data.portafolio, data.linkedin, data.credenciales, data.estado,
      data.estado === 'rechazado' ? 'La evidencia enviada no permite validar la experiencia declarada. Puedes actualizar tu portafolio y volver a enviar la solicitud.' : null,
      data.estado === 'verificado' ? 1 : null,
      data.estado === 'pendiente' ? null : new Date().toISOString());
  return id;
}

function crearCliente(db, data) {
  const hash = bcrypt.hashSync('Demo1234!', 10);
  const r = db.prepare('INSERT INTO usuarios(nombre,apellidos,email,password_hash,rol) VALUES(?,?,?,?,?)')
    .run(data.nombre, data.apellidos, data.email, hash, 'cliente');
  const id = Number(r.lastInsertRowid);
  db.prepare(`INSERT INTO perfiles_cliente(usuario_id,telefono,pais,ciudad,nivel_experiencia,areas_interes,acepta_terminos)
    VALUES(?,?,?,?,?,?,1)`)
    .run(id, data.telefono, data.pais, data.ciudad, data.nivel, JSON.stringify(data.areas));
  return id;
}

function crearCurso(db, data, instructorId, categoriaId) {
  const estado = data.estado;
  const publicado = estado === 'aprobado' ? new Date().toISOString() : null;
  const r = db.prepare(`INSERT INTO cursos
    (instructor_id,categoria_id,titulo,slug,resumen,descripcion,precio,nivel,idioma,imagen_url,estado,motivo_rechazo,publicado_en)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(instructorId, categoriaId, data.titulo, data.slug, data.resumen, data.descripcion, data.precio,
      data.nivel, 'Español', null, estado,
      estado === 'rechazado' ? 'El contenido debe incluir objetivos de aprendizaje y una estructura más detallada antes de volver a revisión.' : null,
      publicado);
  const cursoId = Number(r.lastInsertRowid);

  const secInsert = db.prepare('INSERT INTO curso_secciones(curso_id,titulo,orden) VALUES(?,?,?)');
  const lecInsert = db.prepare(`INSERT INTO curso_lecciones
    (seccion_id,titulo,descripcion,tipo_video,youtube_video_id,duracion_seg,es_preview,orden)
    VALUES(?,?,?,?,?,?,?,?)`);

  data.secciones.forEach((seccion, si) => {
    const [titulo, lecciones] = seccion;
    const s = secInsert.run(cursoId, titulo, si);
    lecciones.forEach((leccion, li) => {
      lecInsert.run(Number(s.lastInsertRowid), leccion,
        `Lección ${li + 1} de la sección ${titulo}.`,
        'youtube', YT[data.video] || YT.logica, 480 + ((si * 3 + li) * 137) % 1200,
        0, li);
    });
  });
  return cursoId;
}

function hace(dias, hora = 9) {
  const d = new Date(Date.now() - Math.max(0, dias) * 86400000);
  d.setUTCHours(hora, (dias * 7) % 60, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function sembrarComunidad(db, { userIds, cursosPorSlug, comprasCreadas }) {
  const notifInsert = db.prepare(`INSERT INTO notificaciones(usuario_id,tipo,titulo,mensaje,enlace,leida,creado)
    VALUES(?,?,?,?,?,?,?)`);
  const notificar = (usuario, tipo, titulo, mensaje, enlace, dias, leida = 0) =>
    notifInsert.run(userIds[usuario] || usuario, tipo, titulo, mensaje, enlace, leida ? 1 : 0, hace(dias, 10));

  // Avisos de bienvenida y verificación.
  notificar('carla', 'sistema', 'Bienvenida a DevStore', 'Explora el catálogo y empieza tu primer curso cuando quieras.', '/cursos.html', 12, 1);
  notificar('luis', 'sistema', 'Bienvenido a DevStore', 'Tu cuenta está lista. Guarda cursos en tu lista y aprende a tu ritmo.', '/cursos.html', 12, 1);
  notificar('ana', 'verificacion', 'Cuenta de instructor verificada', 'Tu perfil ha sido aprobado. Ya puedes publicar cursos.', '/instructor.html', 20, 1);

  // Notificaciones derivadas de las compras más recientes.
  const recientes = [...comprasCreadas].sort((a, b) => a.dias - b.dias).slice(0, 4);
  for (const compra of recientes) {
    const titulos = compra.cursos.map(c => CURSOS.find(x => x.slug === c.slug).titulo);
    const instructores = [...new Set(compra.cursos.map(c => CURSOS.find(x => x.slug === c.slug).instructor))];
    instructores.forEach(instructor => notificar(
      instructor, 'venta', 'Nueva venta de tu curso',
      `Se inscribieron en: ${titulos.join(', ')}.`, '/instructor.html#analitica', compra.dias
    ));
    notificar(compra.cliente, 'compra', 'Compra confirmada',
      `Ya tienes acceso a ${titulos.join(', ')}.`, '/perfil.html#mis-cursos', compra.dias);
  }

  // Foro por curso: preguntas de estudiantes y respuestas de instructores.
  const hiloInsert = db.prepare(`INSERT INTO foro_hilos(curso_id,usuario_id,titulo,contenido,fijado,cerrado,creado,actualizado)
    VALUES(?,?,?,?,?,?,?,?)`);
  const respInsert = db.prepare(`INSERT INTO foro_respuestas(hilo_id,usuario_id,contenido,creado,actualizado)
    VALUES(?,?,?,?,?)`);

  const hilos = [
    {
      curso: 'react-desde-cero', autor: 'carla', instructor: 'ana', dias: 4, fijado: 1,
      titulo: '¿Cuándo conviene usar useEffect?',
      contenido: 'Estoy practicando con el proyecto del módulo 2 y no me queda claro cuándo usar useEffect y cuándo calcular el valor directamente en el render. ¿Algún consejo?',
      respuestas: [
        ['ana', 'Buenísima pregunta. useEffect es para sincronizar con sistemas externos (fetch, suscripciones, DOM). Si puedes calcular el valor durante el render, hazlo ahí. En el módulo 3 lo vemos con ejemplos comparados.', 3],
        ['carla', 'Gracias, ahora sí. Me quedo con la regla de “efecto = algo fuera de React”.', 2]
      ]
    },
    {
      curso: 'python-fastapi-backend', autor: 'luis', instructor: 'diego', dias: 5, fijado: 0,
      titulo: 'Duda con dependencias y sesión de base de datos',
      contenido: 'En la lección de dependencias veo que se abre una sesión por request. ¿Cómo se cierra si ocurre una excepción a mitad del endpoint?',
      respuestas: [
        ['diego', 'FastAPI cierra las dependencias con yield en un bloque finally, incluso si hay excepción. Lo revisamos en la lección 4 con un ejemplo real y logs.', 4]
      ]
    },
    {
      curso: 'logica-de-programacion-desde-cero', autor: 'luis', instructor: 'ana', dias: 8, fijado: 0,
      titulo: 'Ejercicio de bucles: ¿mi solución es válida?',
      contenido: 'Resolví el reto de la agenda con un while y un contador. Funciona, pero el enunciado sugería for. ¿Importa cuál use?',
      respuestas: [
        ['ana', 'Mientras respetes la condición de parada y el resultado sea correcto, es válido. Con for el recorrido queda más expresivo cuando conoces el número de pasos.', 7]
      ]
    },
    {
      curso: 'javascript-moderno', autor: 'carla', instructor: 'diego', dias: 6, fijado: 0,
      titulo: 'Diferencia entre map y forEach en el proyecto',
      contenido: 'En el proyecto final usamos map para transformar y forEach para pintar. ¿Es solo estilo o hay una razón técnica?',
      respuestas: [
        ['diego', 'map devuelve un arreglo nuevo y no debería usarse solo por sus efectos; forEach comunica intención de recorrer. La razón es legibilidad y evitar efectos inesperados.', 5]
      ]
    }
  ];

  for (const hilo of hilos) {
    const cursoId = cursosPorSlug[hilo.curso];
    if (!cursoId) continue;
    const fecha = hace(hilo.dias, 16);
    const r = hiloInsert.run(cursoId, userIds[hilo.autor], hilo.titulo, hilo.contenido,
      hilo.fijado, 0, fecha, fecha);
    const hiloId = Number(r.lastInsertRowid);
    let ultima = fecha;
    for (const [autor, contenido, dias] of hilo.respuestas) {
      const f = hace(dias, 18);
      respInsert.run(hiloId, userIds[autor], contenido, f, f);
      ultima = f;
    }
    db.prepare('UPDATE foro_hilos SET actualizado=? WHERE id=?').run(ultima, hiloId);
    // Aviso al instructor por la pregunta inicial.
    if (hilo.autor !== hilo.instructor) {
      notificar(hilo.instructor, 'foro', `Nueva pregunta en ${CURSOS.find(c => c.slug === hilo.curso).titulo}`,
        `${CLIENTES.find(c => c.key === hilo.autor).nombre} abrió «${hilo.titulo}».`,
        `/curso.html?slug=${hilo.curso}#foro`, hilo.dias);
    }
  }

  // Conversaciones directas de ejemplo (cliente ↔ instructor).
  const convInsert = db.prepare('INSERT INTO conversaciones(usuario_a,usuario_b,creado,actualizado) VALUES(?,?,?,?)');
  const msgInsert = db.prepare('INSERT INTO mensajes(conversacion_id,emisor_id,contenido,leido,creado) VALUES(?,?,?,?,?)');
  const conversaciones = [
    {
      a: 'carla', b: 'ana', dias: 2, mensajes: [
        ['carla', 'Hola Ana, terminé el módulo 2 de React. ¿El proyecto final puede ser una app de recetas?', 1, 2],
        ['ana', '¡Claro! Cualquier app que use estado, efectos y componentes reutilizables sirve. Si quieres, compártela en el foro para recibir feedback.', 1, 2],
        ['carla', 'Perfecto, la subo esta semana. Gracias por responder tan rápido.', 0, 1]
      ]
    },
    {
      a: 'luis', b: 'diego', dias: 9, mensajes: [
        ['luis', 'Buenas Diego, tengo una duda del proyecto de FastAPI sobre validación con Pydantic.', 1, 9],
        ['diego', 'Dispara. Si es sobre modelos anidados, revisa la lección 6; si no, pégame el error y lo vemos.', 1, 9],
        ['luis', 'Es justo eso. Ya lo resolví con un modelo base compartido. Gracias.', 1, 8]
      ]
    },
    {
      a: 'carla', b: 'luis', dias: 1, mensajes: [
        ['carla', 'Luis, vi tu respuesta en el foro de JavaScript. ¿Cómo configuraste Jest para el proyecto?', 1, 1],
        ['luis', 'Usé el preset de Node y un setup que limpia mocks entre tests. Te paso el snippet en el hilo del foro.', 0, 1]
      ]
    }
  ];

  for (const conv of conversaciones) {
    const ida = userIds[conv.a];
    const idb = userIds[conv.b];
    if (!ida || !idb) continue;
    const [x, y] = ida < idb ? [ida, idb] : [idb, ida];
    const inicial = hace(conv.dias, 9);
    const cr = convInsert.run(x, y, inicial, inicial);
    const convId = Number(cr.lastInsertRowid);
    let ultima = inicial;
    for (const [autor, contenido, leido, dias] of conv.mensajes) {
      const f = hace(dias, 12);
      msgInsert.run(convId, userIds[autor], contenido, leido, f);
      ultima = f;
    }
    db.prepare('UPDATE conversaciones SET actualizado=? WHERE id=?').run(ultima, convId);
    const ultimoMensaje = conv.mensajes[conv.mensajes.length - 1];
    const destinatario = ultimoMensaje[0] === conv.a ? conv.b : conv.a;
    const remitente = CLIENTES.find(c => c.key === ultimoMensaje[0])
      || INSTRUCTORES.find(i => i.key === ultimoMensaje[0]);
    notificar(destinatario, 'mensaje', `Nuevo mensaje de ${remitente ? remitente.nombre : 'un usuario'}`,
      ultimoMensaje[1], `/mensajes.html?c=${convId}`, ultimoMensaje[3]);
  }
}

function seedDemo(db, adminId) {
  if (db.prepare('SELECT COUNT(*) AS n FROM cursos').get().n > 0) return;

  const userIds = {};
  for (const i of INSTRUCTORES) userIds[i.key] = crearInstructor(db, i);
  for (const c of CLIENTES) userIds[c.key] = crearCliente(db, c);

  const catIds = {};
  for (const c of CATEGORIAS) catIds[c.slug] = db.prepare('SELECT id FROM categorias WHERE slug=?').get(c.slug).id;

  const cursosPorSlug = {};
  for (const c of CURSOS) {
    cursosPorSlug[c.slug] = crearCurso(db, c, userIds[c.instructor], catIds[c.categoria]);
  }

  const metodoIds = {};
  db.prepare('SELECT id,slug FROM metodos_pago').all().forEach(m => { metodoIds[m.slug] = m.id; });
  const compraInsert = db.prepare('INSERT INTO compras(cliente_id,total,estado,metodo_pago_id,referencia,creado) VALUES(?,?,?,?,?,?)');
  const itemInsert = db.prepare('INSERT INTO compra_items(compra_id,curso_id,precio_unitario) VALUES(?,?,?)');
  const inscInsert = db.prepare('INSERT OR IGNORE INTO inscripciones(cliente_id,curso_id,compra_id,creado) VALUES(?,?,?,?)');
  const pagoInsert = db.prepare('INSERT INTO pagos(compra_id,monto,metodo_pago_id,estado,referencia,detalle,creado) VALUES(?,?,?,?,?,?,?)');
  const detallesPago = { tarjeta: 'Visa •••• 4242', transferencia: 'Transferencia confirmada', paypal: 'PayPal', qr: 'Pago por QR' };

  const comprasCreadas = [];
  COMPRAS_DEMO.forEach((compra, idx) => {
    const cursos = compra.cursos.map(slug => ({ slug, id: cursosPorSlug[slug], precio: CURSOS.find(c => c.slug === slug).precio }));
    const total = Math.round(cursos.reduce((a, c) => a + c.precio, 0) * 100) / 100;
    const ref = `DEMO-${String(idx + 1).padStart(4, '0')}`;
    const metodoId = metodoIds[compra.metodo] || metodoIds.tarjeta;
    const fecha = hace(compra.dias, 11);
    const cr = compraInsert.run(userIds[compra.cliente], total, 'pagada', metodoId, ref, fecha);
    const compraId = Number(cr.lastInsertRowid);
    cursos.forEach(c => {
      itemInsert.run(compraId, c.id, c.precio);
      inscInsert.run(userIds[compra.cliente], c.id, compraId, fecha);
    });
    pagoInsert.run(compraId, total, metodoId, 'completado', ref, detallesPago[compra.metodo] || null, fecha);
    comprasCreadas.push({ ...compra, compraId, fecha, cursos });
  });

  sembrarComunidad(db, { userIds, cursosPorSlug, comprasCreadas });

  // Un curso con estado borrador necesita una sección para que el editor tenga contenido inicial.
  const borrador = cursosPorSlug['microservicios-con-node'];
  if (borrador) {
    const sec = db.prepare('INSERT INTO curso_secciones(curso_id,titulo,orden) VALUES(?,?,0)').run(borrador, 'Introducción');
    db.prepare(`INSERT INTO curso_lecciones(seccion_id,titulo,descripcion,tipo_video,youtube_video_id,duracion_seg,es_preview,orden)
      VALUES(?,?,?,?,?,?,0,0)`)
      .run(Number(sec.lastInsertRowid), 'Bienvenida al curso', 'Qué vamos a construir y cómo aprovechar el curso.', 'youtube', YT.node, 420);
  }
}

const COBROS_DEMO = {
  'ana@devstore.com': {
    banco: 'Banco Unión', titular: 'Ana Torres', cuenta: '1000-1234-5678',
    tipo: 'Cuenta de ahorros', archivo: 'demo-qr-ana.png',
    instrucciones: 'Transfiere el total y usa tu email como referencia. En esta demo el acceso se activa al confirmar.'
  },
  'diego@devstore.com': {
    banco: 'Banco Mercantil Santa Cruz', titular: 'Diego Soto', cuenta: '2000-9876-5432',
    tipo: 'Cuenta corriente', archivo: 'demo-qr-diego.png',
    instrucciones: 'Envía la transferencia y conserva el comprobante. En esta demo el acceso se activa al confirmar.'
  }
};

/**
 * Asegura que los instructores demo tengan datos de cobro y un QR de ejemplo.
 * Solo rellena campos vacíos, así que respeta cualquier cambio hecho desde el panel.
 */
function sembrarCobrosDemo(db) {
  const filas = db.prepare(`SELECT u.id,u.email,p.pago_qr_path
    FROM usuarios u JOIN perfiles_instructor p ON p.usuario_id=u.id
    WHERE u.email IN ('ana@devstore.com','diego@devstore.com')
      AND p.pago_actualizado IS NULL`).all();
  if (!filas.length) return;

  fs.mkdirSync(QR_DIR, { recursive: true });
  for (const fila of filas) {
    const cfg = COBROS_DEMO[fila.email];
    if (!cfg) continue;

    const qrRel = fila.pago_qr_path || path.posix.join('qr', cfg.archivo);
    const absoluto = path.resolve(UPLOAD_DIR, qrRel);
    const base = path.resolve(UPLOAD_DIR) + path.sep;
    if (absoluto.startsWith(base) && !fs.existsSync(absoluto) && path.basename(qrRel).startsWith('demo-')) {
      const origen = path.join(__dirname, cfg.archivo);
      if (fs.existsSync(origen)) {
        fs.mkdirSync(path.dirname(absoluto), { recursive: true });
        fs.copyFileSync(origen, absoluto);
      }
    }

    db.prepare(`UPDATE perfiles_instructor SET
        pago_banco=COALESCE(pago_banco,?),
        pago_titular=COALESCE(pago_titular,?),
        pago_cuenta=COALESCE(pago_cuenta,?),
        pago_tipo_cuenta=COALESCE(pago_tipo_cuenta,?),
        pago_instrucciones=COALESCE(pago_instrucciones,?),
        pago_qr_path=COALESCE(pago_qr_path,?),
        pago_qr_nombre=COALESCE(pago_qr_nombre,?),
        pago_actualizado=COALESCE(pago_actualizado,CURRENT_TIMESTAMP)
      WHERE usuario_id=?`)
      .run(cfg.banco, cfg.titular, cfg.cuenta, cfg.tipo, cfg.instrucciones,
        qrRel, 'qr-demo.png', fila.id);
  }
}

function seed(db) {
  const run = db.transaction(() => {
    seedBase(db);
    if (process.env.SEED_DEMO !== 'false') {
      const admin = db.prepare("SELECT id FROM usuarios WHERE rol='administrador' ORDER BY id LIMIT 1").get();
      seedDemo(db, admin.id);
    }
  });
  run();
}

module.exports = { seed, seedBase, seedDemo, sembrarCobrosDemo, slugify, CATEGORIAS };
