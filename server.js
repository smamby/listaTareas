// server.js (Punto de entrada)
const { app, initiateDbConnection } = require('./app');
const { initializeDbPool, closeDbPool } = require('./db');

const port = process.env.PORT || 8000;
let serverInstance;

console.log('[SERVER] Iniciando aplicación...');

async function startAppAndDb() {
    try {
        await initializeDbPool(); // Inicializa el pool de la DB
        console.log('[SERVER] Conexión a DB establecida, iniciando servidor HTTP.');
        serverInstance = app.listen(port, () => {
            console.log(`[SERVER APP] Servidor escuchando en http://localhost:${port}`);
        });
    } catch (err) {
        console.error('[SERVER] Falló la conexión inicial a la DB. El servidor HTTP no se iniciará.', err.message);
        process.exit(1); // Salir si no se puede conectar a la DB
    }
}

startAppAndDb();

// Para manejo elegante de cierre
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (serverInstance) {
        serverInstance.close(async () => {
            console.log('HTTP server closed');
            await closeDbPool(); // Cerrar el pool de la DB
            process.exit(0);
        });
    }
});

process.on('SIGINT', () => { // También manejar Ctrl+C
    console.log('SIGINT signal received: closing HTTP server');
    if (serverInstance) {
        serverInstance.close(async () => {
            console.log('HTTP server closed');
            await closeDbPool();
            process.exit(0);
        });
    }
});