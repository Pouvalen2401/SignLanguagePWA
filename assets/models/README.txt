Place ML models (TFJS/MediaPipe/face-api) and glTF avatar files in this folder:
- hand_model/* (TFJS artifacts)
- face_model/* (TFJS or face-api weights)
- default_avatar.gltf (parametric avatar glTF)
Service worker will cache these for offline use. Use lightweight models optimized for CPU/GPU acceleration.
