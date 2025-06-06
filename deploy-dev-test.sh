#!/bin/bash

# Función para limpiar y salir
cleanup_and_exit() {
    echo -e "\nSaliendo del menú. Los contenedores de desarrollo siguen corriendo."
    exit 0
}

# Configura la captura de teclas para salir limpiamente con Ctrl+C
trap cleanup_and_exit SIGINT

# Bucle principal del menú
while true; do
    clear
    echo "--- Menú de Operaciones con la Aplicación ---"
    echo "1) Probar la aplicación (Levantar app + MySQL y abrir en el navegador)"
    echo "2) Correr tests unitarios"
    echo "3) Correr tests de integración"
    echo "---------------------------------------------"
    echo "Presiona el número de tu elección o 'q' para salir."
    echo -n "Tu elección: "
    read -n 1 choice
    echo # Agrega una nueva línea después de la entrada

    case $choice in
        1)
            echo "Preparando y levantando la aplicación en modo desarrollo..."
            # Levanta solo la app y la DB, en segundo plano
            docker-compose up -d --build app mysql_db
            echo "Esperando unos segundos para que la aplicación esté lista..."
            sleep 10 # Da un pequeño margen para que la app inicie
            echo "Abriendo la aplicación en http://localhost:8000"
            # Comando para abrir el navegador (compatible con Windows/macOS/Linux)
            if command -v xdg-open > /dev/null; then
                xdg-open http://localhost:8000
            elif command -v open > /dev/null; then
                open http://localhost:8000
            elif command -v start > /dev/null; then
                start http://localhost:8000
            else
                echo "No se pudo abrir el navegador automáticamente. Por favor, visita http://localhost:8000 manualmente."
            fi
            read -n 1 -s -p "Presiona cualquier tecla para volver al menú..."
            echo
            ;;
        2)
            echo "Preparando el entorno y corriendo tests unitarios..."
            # Levanta la app en detached solo por si los unitarios necesitan algún ENV del contenedor,
            # pero no espera a que esté healthy. Luego ejecuta npm test dentro del contenedor.
            # Los tests unitarios no deberían necesitar la DB real, pero si el script Jest
            # o su configuración implican tener la app en Docker, esta es una forma.
            #
            # Opción alternativa (más común para unitarios, si no necesitan Docker):
            # echo "Corriendo tests unitarios en el host local..."
            # npm test
            #
            # Opción si los unitarios sí deben correr en el contenedor de la app:
            docker-compose up -d --build app
            echo "Ejecutando npm test dentro del contenedor de la aplicación..."
            # Asegúrate que el contenedor esté corriendo. docker exec no espera healthcheck
            docker exec listatareas-app-1 npm test
            echo "Tests unitarios terminados."
            read -n 1 -s -p "Presiona cualquier tecla para volver al menú..."
            echo
            ;;
        3)
            echo "Corriendo tests de integración..."
            # Este comando levantará la DB, la app, correrá los tests y luego se detendrá el servicio 'tests'
            docker-compose up --build --exit-code-from tests tests
            echo "Tests de integración terminados."
            read -n 1 -s -p "Presiona cualquier tecla para volver al menú..."
            echo
            ;;
        q|Q)
            cleanup_and_exit
            ;;
        *)
            echo "Opción inválida. Por favor, elige 1, 2, 3 o 'q'."
            read -n 1 -s -p "Presiona cualquier tecla para continuar..."
            echo
            ;;
    esac
done