// __tests__/tareas.test.js
const request = require('supertest');
const app = require('../app'); // La aplicación Express
// No necesitamos `const db = require('../db');` aquí si mockeamos el módulo completo.

// Mocks
let mockTasks = [ // Usa `let` para poder reasignarlo si lo modificas en los tests
    { id: 1, descripcion: 'Tarea 1', completada: 0, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
    { id: 2, descripcion: 'Tarea 2', completada: 1, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
];

// Mockear el módulo de la base de datos ANTES de importar la aplicación
// para asegurarnos de que `app.js` reciba las versiones mockeadas.
const { initializeDbPool, closeDbPool, executeQuery } = require('../db'); // Importa las funciones mockeadas
jest.mock('../db', () => ({
    initializeDbPool: jest.fn(), // Solo mockeamos initializeDbPool
    closeDbPool: jest.fn(), // Solo mockeamos closeDbPool
    getDbPool: jest.fn(), // Mockear getDbPool si lo usaras directamente (pero app.js usa executeQuery)
    executeQuery: jest.fn(), // <--- ¡Asegúrate de que executeQuery sea un mock!
}));


describe('API de Tareas', () => {
    // Antes de todos los tests, asegura que el pool de DB mockeado esté inicializado y resetea los mocks
    beforeEach(async () => { // Usar beforeEach para resetear mocks antes de cada test
        // Resetear el estado de los mocks entre tests si los tests modifican `mockTasks`
        mockTasks = [
            { id: 1, descripcion: 'Tarea 1', completada: 0, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
            { id: 2, descripcion: 'Tarea 2', completada: 1, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
        ];
        jest.clearAllMocks(); // Limpiar llamadas a mocks

        // Configura la implementación de executeQuery para cada tipo de consulta
        executeQuery.mockImplementation(async (sql, values) => {
            console.log(`[TESTS MOCK DB] Ejecutando query: ${sql}, valores: ${JSON.stringify(values)}`);
            if (sql.includes('SELECT * FROM tareas')) {
                return Promise.resolve(JSON.parse(JSON.stringify(mockTasks))); // Devuelve una copia profunda
            }
            if (sql.includes('INSERT INTO tareas')) {
                const newId = mockTasks.length > 0 ? Math.max(...mockTasks.map(t => t.id)) + 1 : 1;
                const newTask = {
                    id: newId,
                    descripcion: values[0],
                    completada: 0,
                    fecha_creacion: new Date()
                };
                mockTasks.push(newTask);
                return Promise.resolve({ insertId: newId, affectedRows: 1 });
            }
            if (sql.includes('UPDATE tareas SET completada')) {
                const completadaValue = values[0]; // 0 o 1
                const idToUpdate = values[1];
                let affectedRows = 0;
                mockTasks = mockTasks.map(task => {
                    if (task.id === idToUpdate) {
                        affectedRows = 1;
                        return { ...task, completada: completadaValue };
                    }
                    return task;
                });
                return Promise.resolve({ affectedRows: affectedRows });
            }
            if (sql.includes('DELETE FROM tareas')) {
                const idToDelete = values[0];
                const initialLength = mockTasks.length;
                mockTasks = mockTasks.filter(t => t.id !== idToDelete);
                return Promise.resolve({ affectedRows: initialLength - mockTasks.length });
            }
            if (sql.includes('UPDATE tareas SET completada = ? WHERE id = ?')) {
                const completadaValue = values[0]; // Este será 0 o 1
                const idToUpdate = parseInt(values[1], 10); // Asegúrate de convertir a número para la comparación
                let affectedRows = 0;
                let updatedTask = null;

                mockTasks = mockTasks.map(task => {
                    if (task.id === idToUpdate) {
                        affectedRows = 1;
                        updatedTask = { ...task, completada: completadaValue };
                        return updatedTask;
                    }
                    return task;
                });
                // Devuelve el objeto de resultado de MySQL. No es un array de arrays en este caso.
                // Usamos el formato que MySQL devuelve para UPDATE: { affectedRows: X }
                return Promise.resolve({ affectedRows: affectedRows });
            }
            if (sql.includes('DELETE FROM tareas WHERE id = ?')) {
                const idToDelete = parseInt(values[0], 10); // Asegúrate de convertir a número para la comparación
                const initialLength = mockTasks.length;
                mockTasks = mockTasks.filter(t => t.id !== idToDelete);
                // Devuelve el objeto de resultado de MySQL.
                return Promise.resolve({ affectedRows: initialLength - mockTasks.length });
            }
            // Para cualquier otra consulta no mockeada
            return Promise.resolve([]); 
        });

        // Asegúrate de que initializeDbPool mockeado no falle
        initializeDbPool.mockResolvedValue(true); 

        console.log('[TESTS] Mock DB connection successful for tests.');
    });

    // Limpiar mocks después de todos los tests
    afterAll(async () => {
        await closeDbPool(); // Llamar al closeDbPool mockeado
    });

    // ... (Tus casos de prueba existentes) ...

    it('GET /api/tareas - debe devolver todas las tareas', async () => {
        const response = await request(app).get('/api/tareas');
        expect(response.statusCode).toBe(200);
        // Asegúrate de que las fechas se comparen correctamente o se normalicen
        const receivedBody = response.body.map(task => ({
            ...task,
            fecha_creacion: new Date(task.fecha_creacion)
        }));
        expect(receivedBody).toEqual(mockTasks);
    });

    it('POST /api/tareas - debe crear una nueva tarea', async () => {
        const nuevaTarea = { descripcion: 'Nueva Tarea Test' };
        const response = await request(app)
            .post('/api/tareas')
            .send(nuevaTarea);
        expect(response.statusCode).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.descripcion).toBe(nuevaTarea.descripcion);
        expect(response.body.completada).toBe(0); 

        // Verifica que executeQuery fue llamado con los parámetros correctos
        expect(executeQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO tareas (descripcion) VALUES (?)'), // Solo verifica la descripción ya que fecha_creacion es gestionada por la DB
            [nuevaTarea.descripcion]
        );
    });

    it('PUT /api/tareas/:id - debe actualizar una tarea existente', async () => {
        const tareaIdActualizar = 1;
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdActualizar}`)
            .send(datosActualizacion);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea actualizada correctamente');

        // Verifica que executeQuery fue llamado con los parámetros correctos
        expect(executeQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE tareas SET completada = ? WHERE id = ?'),
            [1, tareaIdActualizar] 
        );
    });

    it('DELETE /api/tareas/:id - debe eliminar una tarea existente', async () => {
        const tareaIdEliminar = 1;
        const response = await request(app).delete(`/api/tareas/${tareaIdEliminar}`);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea eliminada correctamente');

        // Verifica que executeQuery fue llamado con los parámetros correctos
        expect(executeQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM tareas WHERE id = ?'),
            [tareaIdEliminar]
        );
    });

    it('PUT /api/tareas/:id - debe devolver 404 si la tarea no existe', async () => {
        const tareaIdNoExistente = 999;
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdNoExistente}`)
            .send(datosActualizacion);
        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe('Tarea no encontrada');
    });

    it('DELETE /api/tareas/:id - debe devolver 404 si la tarea no existe', async () => {
        const tareaIdNoExistente = 999;
        const response = await request(app).delete(`/api/tareas/${tareaIdNoExistente}`);
        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe('Tarea no encontrada');
    });
});