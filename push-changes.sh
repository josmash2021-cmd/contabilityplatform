#!/bin/bash
set -e

echo "=== AI AETHEL - Push to GitHub ==="
echo ""

# Verificar si hay cambios para commitear
if git diff --cached --quiet && git diff --quiet; then
    echo "No hay cambios para commitear."
    exit 0
fi

# Agregar todos los cambios
echo "📦 Agregando cambios..."
git add .

# Commit con mensaje descriptivo
echo "📝 Creando commit..."
git commit -m "feat: video background for login/register pages

- Add orb video as background for mobile login/register
- Keep split layout with video on left panel for desktop
- Increase mobile font sizes and spacing
- Improve responsive design for phones
- Remove Spline 3D dependency"

# Push al repositorio remoto
echo "🚀 Haciendo push a GitHub..."
git push origin main

echo ""
echo "✅ Cambios enviados exitosamente!"
echo "Railway debería detectar el push y redeployar automáticamente."
