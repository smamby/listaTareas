// db.js
const mysql = require('mysql2/promise'); // Usando la versión basada en promesas

let dbPool;

async function initializeDbPool() {
    if (dbPool) {
        console.log('[APP DB] El Pool ya está inicializado.');
        return dbPool;
    }

    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'lista_tareas_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };

    const maxRetries = 10;
    for (let i = 1; i <= maxRetries; i++) {
        try {
            console.log(`[APP DB] Intentando inicializar Pool de MySQL... (Intento ${i} de ${maxRetries})`);
            const pool = mysql.createPool(dbConfig);
            // Intentar obtener una conexión para asegurar que el pool funciona
            const connection = await pool.getConnection();
            connection.release();
            dbPool = pool;
            console.log('[APP DB] Pool de conexiones a la base de datos MySQL inicializado y conectado.');
            return dbPool;
        } catch (error) {
            console.error(`[APP DB] Error al conectar con la base de datos (Intento ${i}):`, error.message);
            if (i < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
            } else {
                throw new Error('No se pudo conectar a la base de datos después de varios intentos.');
            }
        }
    }
}

function getDbPool() {
    if (!dbPool) {
        // Esto idealmente no debería ocurrir si initializeDbPool se llama al inicio de la aplicación
        throw new Error('El pool de la base de datos no ha sido inicializado.');
    }
    return dbPool;
}

async function executeQuery(sql, values = []) {
    if (!dbPool) {
        throw new Error('Pool de DB no inicializado. No se puede ejecutar la consulta.');
    }
    let connection;
    try {
        connection = await dbPool.getConnection();
        const [rows] = await connection.execute(sql, values); // Usar connection.execute para prepared statements
        return rows;
    } catch (err) {
        console.error('[DB] Error ejecutando consulta:', err.message);
        throw err;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}


// Función para cerrar el pool (útil para un apagado elegante o para tests)
async function closeDbPool() {
    if (dbPool) {
        console.log('[APP DB] Cerrando pool de conexiones...');
        await dbPool.end();
        dbPool = null; // Limpiar el pool
        console.log('[APP DB] Pool de conexiones cerrado.');
    }
}

module.exports = {
    initializeDbPool,
    getDbPool,
    closeDbPool,
    executeQuery
};