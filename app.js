// app.js
const express = require('express');
const mysql = require('mysql2'); // Mantén mysql2, ya que es el que soporta createPool
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración de la conexión a MySQL usando variables de entorno
const dbConfig = {
    host: process.env.DB_HOST || 'mysql_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
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
function initializeDbPool(initialAttempt = true) {
    console.log(`[APP DB] Intentando inicializar Pool de MySQL... (Intento ${poolInitRetries + 1} de ${MAX_POOL_INIT_RETRIES})`);

    try {
        dbPool = mysql.createPool(dbConfig);

        // Intentar obtener una conexión para verificar que el pool está operativo
        dbPool.getConnection((err, connection) => {
            if (err) {
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
                return; // Importante para no liberar la conexión si hubo error
            }

            console.log('[APP DB] Pool de conexiones a la base de datos MySQL inicializado y conectado.');
            connection.release(); // ¡Liberar la conexión de vuelta al pool inmediatamente!
            poolInitRetries = 0; // Reinicia el contador de reintentos
            if (initialAttempt && module.exports.onDbConnectionSuccess) {
                module.exports.onDbConnectionSuccess(dbPool);
            }
        });

        // Manejo de errores a nivel del pool (para errores que no son de conexión directa, sino de las conexiones dentro del pool)
        dbPool.on('error', err => {
            console.error('[APP DB Pool] Error en el pool de conexiones:', err);
            if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED' || err.fatal) {
                console.warn('[APP DB Pool] Conexión interna del pool perdida o rechazada. El pool intentará manejar la reconexión. Si esto persiste, revisar configuración del pool o conectividad.');
                // El pool gestiona la reconexión de sus conexiones internas.
                // No necesitamos llamar a `initializeDbPool` aquí a menos que el pool falle completamente.
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
function executeQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!dbPool) {
            console.error('[APP DB] executeQuery: El pool de conexiones no está inicializado.');
            return reject(new Error('Pool de DB no inicializado.'));
        }

        dbPool.getConnection((err, connection) => {
            if (err) {
                console.error('[APP DB] Error al obtener conexión del pool para query:', err.stack);
                // Si no se puede obtener una conexión, el pool puede estar saturado o la DB no disponible
                return reject(new Error('No se pudo obtener conexión de la DB. ' + err.message));
            }
            connection.query(sql, params, (error, results, fields) => {
                connection.release(); // ¡IMPORTANTE! Liberar la conexión de vuelta al pool
                if (error) {
                    console.error('[APP DB] Error al ejecutar consulta:', error.stack);
                    return reject(error);
                }
                resolve(results);
            });
        });
    });
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