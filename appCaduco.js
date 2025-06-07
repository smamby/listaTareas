// app.js
const express = require('express');
const mysql = require('mysql2/promise'); // Mantén mysql2, ya que es el que soporta createPool
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración de la conexión a MySQL usando variables de entorno
const dbConfig = {
    host: process.env.DB_HOST ||  'localhost', //'mysql_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'lista_tareas_db',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306, // Convertir a número, por defecto 3306
    waitForConnections: true, // El pool esperará si todas las conexiones están en uso
    connectionLimit: 10,      // Número máximo de conexiones simultáneas en el pool
    queueLimit: 0,            // Sin límite en la cola para solicitudes pendientes
    enableKeepAlive: true,    // Mantener las conexiones vivas (útil para cloud)
    keepAliveInitialDelay: 0, // Delay inicial para keep-alive
    // En entornos como Aiven, a veces se recomienda un `connectTimeout` y `acquireTimeout`
    // para manejar conexiones lentas, pero se deben ajustar con cuidado.
    // connectTimeout: 10000, // 10 segundos
    // acquireTimeout: 10000 // 10 segundos para adquirir del pool
};

let dbPool; // Renombramos a dbPool para claridad
const MAX_POOL_INIT_RETRIES = 10; // Máximo de reintentos para iniciar el pool
let poolInitRetries = 0;

// Función para inicializar el pool de conexiones y manejar reintentos
async function initializeDbPool(initialAttempt = true) { // ¡Hacerla async!
    console.log(`[APP DB] Intentando inicializar Pool de MySQL... (Intento ${poolInitRetries + 1} de ${MAX_POOL_INIT_RETRIES})`);

    try {
        dbPool = mysql.createPool(dbConfig); // dbPool es ahora un objeto basado en promesas

        // Intentar obtener una conexión para verificar que el pool está operativo
        let connection; // Declarar la conexión aquí
        try {
            connection = await dbPool.getConnection(); // <-- ¡Aquí se usa await!
            console.log('[APP DB] Pool de conexiones a la base de datos MySQL inicializado y conectado.');
            connection.release(); // <-- Liberar la conexión basada en promesas
            poolInitRetries = 0;
            if (initialAttempt && module.exports.onDbConnectionSuccess) {
                module.exports.onDbConnectionSuccess(dbPool);
            }
        } catch (err) {
            console.error('[APP DB] Error al obtener conexión inicial del Pool:', err.message);
            if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED' || err.fatal) {
                console.log('[APP DB] Fallo de conexión inicial del Pool. Reintentando...');
            } else {
                console.error('[APP DB] Otro error no fatal durante la inicialización del Pool:', err);
            }

            if (poolInitRetries < MAX_POOL_INIT_RETRIES - 1) {
                poolInitRetries++;
                setTimeout(() => initializeDbPool(false), 1000 * Math.pow(2, poolInitRetries));
            } else {
                console.error('[APP DB] Número máximo de reintentos de inicialización del Pool alcanzado. La aplicación no podrá conectar a la DB.');
                if (initialAttempt && module.exports.onDbConnectionFailure) {
                    module.exports.onDbConnectionFailure(new Error("No se pudo conectar a la DB después de máximos reintentos."));
                }
            }
            if (connection) connection.release(); // Asegurarse de liberar la conexión si se obtuvo y luego falló
        }

        dbPool.on('error', err => {
            console.error('[APP DB Pool] Error en el pool de conexiones:', err);
            if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED' || err.fatal) {
                console.warn('[APP DB Pool] Conexión interna del pool perdida o rechazada. El pool intentará manejar la reconexión. Si esto persiste, revisar configuración del pool o conectividad.');
            } else {
                console.error('[APP DB Pool] Otro error en el pool:', err);
            }
        });

    } catch (error) {
        console.error('[APP DB] Error fatal al crear el Pool de conexiones:', error.stack);
        if (initialAttempt && module.exports.onDbConnectionFailure) {
            module.exports.onDbConnectionFailure(new Error("Error fatal al crear el pool de DB."));
        }
    }
}

// Función de utilidad para ejecutar consultas usando el Pool de conexiones
async function executeQuery(sql, params = []) { // ¡Hacerla async!
    if (!dbPool) {
        console.error('[APP DB] executeQuery: El pool de conexiones no está inicializado.');
        // En lugar de devolver un Promise.reject, puedes lanzar un error directamente
        throw new Error('Pool de DB no inicializado.');
    }

    let connection; // Declarar la conexión aquí
    try {
        connection = await dbPool.getConnection(); // <-- ¡Aquí se usa await!
        // connection.query ahora también devuelve una promesa
        const [results] = await connection.query(sql, params); // <-- ¡Aquí se usa await!
        return results; // Devolver los resultados directamente
    } catch (err) {
        console.error('[APP DB] Error al ejecutar consulta:', err.stack);
        throw err; // Relanzar el error para que sea capturado por las rutas
    } finally {
        if (connection) connection.release(); // ¡IMPORTANTE! Asegurar que la conexión se libere siempre
    }
}

// RUTAS DE LA API
// Obtener todas las tareas
app.get('/api/tareas', async (req, res) => {
    console.log('[APP] GET /api/tareas solicitada');
    try {
        const results = await executeQuery('SELECT * FROM tareas ORDER BY fecha_creacion DESC');
        res.json(results);
    } catch (err) {
        console.error('[APP] Error al obtener tareas:', err);
        // Devolver un 503 si el error es de conexión/pool no disponible, 500 para otros errores.
        const statusCode = err.message.includes('Pool de DB no inicializado') || err.message.includes('No se pudo obtener conexión') ? 503 : 500;
        res.status(statusCode).json({ error: 'Error interno del servidor al obtener tareas', details: err.message });
    }
});

// Agregar una nueva tarea
app.post('/api/tareas', async (req, res) => {
    console.log('[APP] POST /api/tareas solicitada. Body:', req.body);
    const { descripcion } = req.body;
    if (!descripcion) {
        console.warn('[APP] POST /api/tareas: Descripción es requerida.');
        return res.status(400).json({ error: 'La descripción es requerida' });
    }
    try {
        const result = await executeQuery('INSERT INTO tareas (descripcion) VALUES (?)', [descripcion]);
        console.log(`[APP] Tarea agregada con ID: ${result.insertId}`);
        res.status(201).json({ id: result.insertId, descripcion, completada: false });
    } catch (err) {
        console.error('[APP] Error al agregar tarea:', err);
        const statusCode = err.message.includes('Pool de DB no inicializado') || err.message.includes('No se pudo obtener conexión') ? 503 : 500;
        res.status(statusCode).json({ error: 'Error interno del servidor al agregar tarea', details: err.message });
    }
});

// Actualizar una tarea
app.put('/api/tareas/:id', async (req, res) => {
    const { id } = req.params;
    const { completada } = req.body;
    console.log(`[APP] PUT /api/tareas/${id} solicitada. Body:`, req.body);

    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID de tarea inválido o faltante' });
    }
    if (typeof completada !== 'boolean') {
        return res.status(400).json({ error: 'El estado "completada" debe ser un booleano' });
    }

    try {
        const sql = 'UPDATE tareas SET completada = ? WHERE id = ?';
        const result = await executeQuery(sql, [completada, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }
        res.json({ message: 'Tarea actualizada correctamente' });
    } catch (err) {
        console.error('[APP] Error al actualizar tarea:', err);
        const statusCode = err.message.includes('Pool de DB no inicializado') || err.message.includes('No se pudo obtener conexión') ? 503 : 500;
        res.status(statusCode).json({ error: 'Error al actualizar tarea', details: err.message });
    }
});

// Eliminar una tarea
app.delete('/api/tareas/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`[APP] DELETE /api/tareas/${id} solicitada.`);

    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'ID de tarea inválido o faltante' });
    }

    try {
        const sql = 'DELETE FROM tareas WHERE id = ?';
        const result = await executeQuery(sql, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }
        res.json({ message: 'Tarea eliminada correctamente' });
    } catch (err) {
        console.error('[APP] Error al eliminar tarea:', err);
        const statusCode = err.message.includes('Pool de DB no inicializado') || err.message.includes('No se pudo obtener conexión') ? 503 : 500;
        res.status(statusCode).json({ error: 'Error al eliminar tarea', details: err.message });
    }
});

// Manejo de rutas no encontradas (404)
app.use((req, res, next) => {
    console.warn(`[APP] Ruta no encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo de errores generales (500)
app.use((err, req, res, next) => {
    console.error('[APP] Error global no manejado:', err.stack);
    res.status(500).json({ error: 'Error interno del servidor', details: err.message });
});

// Exportamos la app y la función para iniciar el Pool de la DB
module.exports = {
    app,
    initiateDbConnection: (onSuccess, onFailure) => {
        module.exports.onDbConnectionSuccess = onSuccess;
        module.exports.onDbConnectionFailure = onFailure;
        initializeDbPool(true); // Inicia la inicialización del pool
    },
    // Exponer executeQuery para pruebas de integración o si se necesita directamente fuera de las rutas.
    executeQuery: executeQuery
};