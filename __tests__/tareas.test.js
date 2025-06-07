// __tests__/tareas.test.js
const request = require('supertest');
const app = require('../app'); 

// Mocks
let mockTasks = []; // Inicializamos vacío para que beforeEach lo configure

// Mockear el módulo de la base de datos ANTES de importar la aplicación
const { initializeDbPool, closeDbPool, executeQuery } = require('../db'); 
jest.mock('../db', () => ({
    initializeDbPool: jest.fn(), 
    closeDbPool: jest.fn(), 
    getDbPool: jest.fn(), 
    executeQuery: jest.fn(), 
}));


describe('API de Tareas', () => {
    beforeEach(async () => { 
        mockTasks = [
            { id: 1, descripcion: 'Tarea 1', completada: 0, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
            { id: 2, descripcion: 'Tarea 2', completada: 1, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
        ];
        jest.clearAllMocks(); 

        executeQuery.mockImplementation(async (sql, values) => {
            console.log(`[TESTS MOCK DB] Ejecutando query: ${sql}, valores: ${JSON.stringify(values)}`);
            if (sql.includes('SELECT * FROM tareas')) {
                return Promise.resolve(JSON.parse(JSON.stringify(mockTasks))); 
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
            // Lógica corregida para UPDATE
            if (sql.includes('UPDATE tareas SET completada = ? WHERE id = ?')) {
                const completadaValue = values[0]; 
                const idToUpdate = parseInt(values[1], 10); // <--- Conversión a número crucial

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
            // Lógica corregida para DELETE
            if (sql.includes('DELETE FROM tareas WHERE id = ?')) {
                const idToDelete = parseInt(values[0], 10); // <--- Conversión a número crucial
                const initialLength = mockTasks.length;
                mockTasks = mockTasks.filter(t => t.id !== idToDelete);
                return Promise.resolve({ affectedRows: initialLength - mockTasks.length });
            }
            return Promise.resolve([]); 
        });

        initializeDbPool.mockResolvedValue(true); 

        console.log('[TESTS] Mock DB connection successful for tests.');
    });

    afterAll(async () => {
        await closeDbPool(); 
    });

    // Mantén tus tests, solo ajustamos el de POST
    it('GET /api/tareas - debe devolver todas las tareas', async () => {
        const response = await request(app).get('/api/tareas');
        expect(response.statusCode).toBe(200);
        const receivedBody = response.body.map(task => ({
            ...task,
            fecha_creacion: new Date(task.fecha_creacion).toISOString() // Normaliza la fecha a ISO string para comparar
        }));
        const expectedMockTasks = mockTasks.map(task => ({
            ...task,
            fecha_creacion: task.fecha_creacion.toISOString() // Normaliza la fecha a ISO string para comparar
        }));
        expect(receivedBody).toEqual(expect.arrayContaining(expectedMockTasks)); // Usar arrayContaining si el orden puede variar o hay otros campos
    });

    it('POST /api/tareas - debe crear una nueva tarea', async () => {
        const nuevaTarea = { descripcion: 'Nueva Tarea Test' };
        const response = await request(app)
            .post('/api/tareas')
            .send(nuevaTarea);
        expect(response.statusCode).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.descripcion).toBe(nuevaTarea.descripcion);
        expect(response.body.completada).toBe(0); // <-- Esperar 0, no false
    });

    it('PUT /api/tareas/:id - debe actualizar una tarea existente', async () => {
        const tareaIdActualizar = 1;
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdActualizar}`)
            .send(datosActualizacion);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea actualizada correctamente');

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