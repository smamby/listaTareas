#!/bin/bash

echo "clonando repositorio"

git clone https://github.com/smamby/listaTareas.git

if [ $? -ne 0 ]; then
    echo "Error al clonar el repositorio"
    exit 1
fi

cd listaTareas

echo "Construyendo imagen de docker para el backend"

docker build -t lista-tareas:latest .

if [ $? -ne 0 ]; then
    echo "Error al construir la imagen de Docker"
    exit 1
fi


echo "Ejecutando contenedor de docker para el backend"

docker run -d -p 8000:8000 --name backend-lista-tareas -v $(pwd):/app -e DB_HOST=host.docker.internal -e DB_PORT=3306 -e DB_USER=root -e DB_PASSWORD=root -e DB_NAME=lista_tareas_db lista-tareas

if [ $? -ne 0 ]; then
    echo "Error al ejecutar el contenedor de Docker"
    exit 1
fi

echo "Contenedor de Docker para el backend ejecutándose correctamente"

start http://localhost:8000