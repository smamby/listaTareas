// server.js (Punto de entrada)
const { app, initiateDbConnection } = require('./app'); // Importa desde app.js

const port = process.env.PORT || 3000;
let serverInstance;

console.log('[SERVER] Iniciando aplicación...');

initiateDbConnection(
    (dbInstance) => { // onSuccess
        console.log('[SERVER] Conexión a DB establecida, iniciando servidor HTTP.');
        serverInstance = app.listen(port, () => {
            console.log(`[SERVER APP] Servidor escuchando en http://localhost:${port}`);
        });
    },
    (err) => { // onFailure
        console.error('[SERVER] Falló la conexión inicial a la DB. El servidor HTTP no se iniciará.', err.message);
        // Podrías decidir salir del proceso si la DB es crítica para el arranque.
        // process.exit(1);
    }
);

// Para manejo elegante de cierre (opcional pero bueno para producción)
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('HTTP server closed');
            // Aquí podrías cerrar la conexión a la DB si es necesario
            // db.end(...); // Necesitarías obtener la instancia de 'db' desde app.js
            process.exit(0);
        });
    }
});