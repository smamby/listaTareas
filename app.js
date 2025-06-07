// app.js
const express = require('express');
const cors = require('cors');
// Importa las funciones de nuestro nuevo módulo de base de datos
const { executeQuery } = require('./db'); // Solo necesitamos executeQuery aquí, no initializeDbPool, getDbPool

const app = express();
const PORT = process.env.APP_PORT || 8000; // Mantén el PORT para referencia

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Si tienes archivos estáticos en `public`

// --- RUTAS DE LA API ---

// Obtener todas las tareas
app.get('/api/tareas', async (req, res) => {
    console.log('[APP] GET /api/tareas solicitada');
    try {
        const results = await executeQuery('SELECT * FROM tareas ORDER BY fecha_creacion DESC');
        res.json(results);
    } catch (err) {
        console.error('[APP] Error al obtener tareas:', err);
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
        res.status(201).json({ id: result.insertId, descripcion, completada: 0 });
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
    const completadaForDb = completada ? 1 : 0;

    try {
        const sql = 'UPDATE tareas SET completada = ? WHERE id = ?';
        const result = await executeQuery(sql, [completadaForDb, parseInt(id)]);

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
        const result = await executeQuery(sql, [parseInt(id)]);

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

// --- Manejo de errores ---

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

// Exporta la instancia de la aplicación Express
module.exports = app;