import { useRef, useEffect } from "react";
import * as THREE from "three";
import dirtImg from "/dirt.jpg";

function App() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    const fov = 75;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const near = 0.1;
    const far = 100;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 2;
    camera.position.y = 1.5; // lower camera
    camera.lookAt(0, 0, 5); // look slightly down the road

    const scene = new THREE.Scene();
    // Use a simple solid color for the sky for performance
    scene.background = new THREE.Color(0x87ceeb);

    // --- Performance Optimizations ---
    const tileSize = 10;
    const visibleRadius = 8; // Use a fixed, optimized radius
    const tiles = new Map(); // key: "x_z", value: mesh

    // 1. Create and share a single material for all tiles
    const texture = new THREE.TextureLoader().load(dirtImg);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const tileMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0x8b7b5a, // dirt fallback
      side: THREE.DoubleSide,
    });

    function tileKey(x, z) {
      return `${x}_${z}`;
    }

    function createTile(x, z) {
      const geometry = new THREE.PlaneGeometry(tileSize, tileSize, 1, 1);
      const mesh = new THREE.Mesh(geometry, tileMaterial); // Reuse material
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x * tileSize, 0, z * tileSize);
      scene.add(mesh);
      return mesh;
    }

    function updateTiles(cx, cz) {
      const needed = new Set();
      const cameraTileX = Math.floor(cx / tileSize);
      const cameraTileZ = Math.floor(cz / tileSize);

      for (let i = -visibleRadius; i <= visibleRadius; i++) {
        for (let j = -visibleRadius; j <= visibleRadius; j++) {
          const tx = cameraTileX + i;
          const tz = cameraTileZ + j;

          if (i * i + j * j > visibleRadius * visibleRadius) continue;

          const key = tileKey(tx, tz);
          needed.add(key);
          if (!tiles.has(key)) {
            tiles.set(key, createTile(tx, tz));
          }
        }
      }

      // Remove tiles that are no longer needed
      for (const [key, mesh] of tiles.entries()) {
        if (!needed.has(key)) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          tiles.delete(key);
        }
      }
    }

    // Camera parameters
    let cameraZ = 0;
    let cameraX = 0;
    let cameraY = 15;
    const moveSpeed = 0.5;
    const keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
    };
    let jumpY = 0;
    let jumpVelocity = 0;
    let isJumping = false;
    const jumpStrength = 0.5;
    const gravity = 0.025;

    function handleKeyDown(e) {
      if (e.key in keys) keys[e.key] = true;
      if (e.code === "Space") keys.space = true;
    }
    function handleKeyUp(e) {
      if (e.key in keys) keys[e.key] = false;
      if (e.code === "Space") keys.space = false;
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // FPS camera state
    let yaw = 0;
    let pitch = 0;
    const pitchLimit = Math.PI / 2 - 0.01;

    function onFPSMouseMove(e) {
      if (document.pointerLockElement !== canvas) return;
      const sensitivity = 0.002;
      yaw += e.movementX * sensitivity;
      pitch -= e.movementY * sensitivity;
      pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
    }
    document.addEventListener("mousemove", onFPSMouseMove);

    function requestPointerLock() {
      canvas.requestPointerLock();
    }
    canvas.addEventListener("click", requestPointerLock);

    function handleResize() {
      const pixelRatio = window.devicePixelRatio;
      const width = (canvas.clientWidth * pixelRatio) | 0;
      const height = (canvas.clientHeight * pixelRatio) | 0;
      const needResize = canvas.width !== width || canvas.height !== height;
      if (needResize) {
        renderer.setSize(width, height, false);
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
      }
    }

    function cleanup() {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", onFPSMouseMove);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", requestPointerLock);
      // Dispose of shared resources
      tileMaterial.dispose();
      texture.dispose();
    }

    window.addEventListener("resize", handleResize);
    handleResize();

    // 2. Throttle tile updates
    let lastCameraTileX = -Infinity;
    let lastCameraTileZ = -Infinity;

    function render() {
      // Camera movement
      let moveDX = 0, moveDZ = 0;
      const forwardX = Math.cos(yaw);
      const forwardZ = Math.sin(yaw);
      if (keys.w) { moveDX += forwardX; moveDZ += forwardZ; }
      if (keys.s) { moveDX -= forwardX; moveDZ -= forwardZ; }
      if (keys.d) { moveDX -= forwardZ; moveDZ += forwardX; }
      if (keys.a) { moveDX += forwardZ; moveDZ -= forwardX; }

      if (moveDX !== 0 || moveDZ !== 0) {
        const len = Math.sqrt(moveDX * moveDX + moveDZ * moveDZ);
        cameraX += (moveDX / len) * moveSpeed;
        cameraZ += (moveDZ / len) * moveSpeed;
      }

      // Handle jump
      if (keys.space && !isJumping && jumpY === 0) {
        jumpVelocity = jumpStrength;
        isJumping = true;
      }
      if (isJumping) {
        jumpY += jumpVelocity;
        jumpVelocity -= gravity;
        if (jumpY <= 0) {
          jumpY = 0;
          jumpVelocity = 0;
          isJumping = false;
        }
      }

      const camY = cameraY + jumpY;
      camera.position.set(cameraX, camY, cameraZ);
      const lookAtX = cameraX + Math.cos(yaw) * Math.cos(pitch);
      const lookAtY = camY + Math.sin(pitch);
      const lookAtZ = cameraZ + Math.sin(yaw) * Math.cos(pitch);
      camera.lookAt(lookAtX, lookAtY, lookAtZ);

      // Throttle tile updates
      const cameraTileX = Math.floor(cameraX / tileSize);
      const cameraTileZ = Math.floor(cameraZ / tileSize);
      if (cameraTileX !== lastCameraTileX || cameraTileZ !== lastCameraTileZ) {
        updateTiles(cameraX, cameraZ);
        lastCameraTileX = cameraTileX;
        lastCameraTileZ = cameraTileZ;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    return cleanup;
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100dvw", height: "100dvh", display: "block" }}
      ></canvas>
      <div
        style={{
          position: "absolute",
          top: "0",
          right: "0",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "white",
          padding: "30px",
          fontFamily: "sans-serif",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
          <kbd style={{ padding: "0.5rem 0.75rem", border: "3px solid white", borderRadius: "4px" }}>🖱️</kbd>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#ccc" }}>
          Use mouse to look
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", margin: "20px 0 0 0" }}>
          <kbd style={{ padding: "0.5rem 0.75rem", border: "3px solid white", borderRadius: "4px" }}>W</kbd>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
          <kbd style={{ padding: "0.5rem 0.75rem", border: "3px solid white", borderRadius: "4px" }}>A</kbd>
          <kbd style={{ padding: "0.5rem 0.75rem", border: "3px solid white", borderRadius: "4px" }}>S</kbd>
          <kbd style={{ padding: "0.5rem 0.75rem", border: "3px solid white", borderRadius: "4px" }}>D</kbd>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#ccc", margin: "0 0 20px 0" }}>
          Use w, a, s, d to move
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
          <kbd style={{ padding: "0.5rem 1.5rem", border: "3px solid white", borderRadius: "4px" }}>SPACE</kbd>
          <div style={{ fontSize: "0.8rem", color: "#ccc" }}>
            to jump
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
