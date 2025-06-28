import { useRef, useEffect } from "react";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import dirtImg from "/dirt.jpg";

function App() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    const fov = 75;
    const aspect = 2;
    const near = 0.1;
    const far = 100;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 2;
    camera.position.y = 1.5; // lower camera
    camera.lookAt(0, 0, 5); // look slightly down the road

    const scene = new THREE.Scene();
    // Remove the gradient sky texture, use only solid color
    scene.background = new THREE.Color(0x87ceeb);

    // === Dynamic Sky ===
    const sky = new Sky();
    sky.scale.setScalar(450000);
    const phi = THREE.MathUtils.degToRad(90);
    const theta = THREE.MathUtils.degToRad(180);
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(
      1,
      phi,
      theta
    );
    sky.material.uniforms.sunPosition.value = sunPosition;
    scene.add(sky);

    // Land (tile) parameters
    const tileSize = 10;
    const tileHalf = tileSize / 2;
    let visibleRadius = 6; // will be dynamically set
    const tiles = new Map(); // key: "x_z", value: mesh

    function tileKey(x, z) {
      return `${x}_${z}`;
    }

    function getHeight(worldX, worldZ) {
      // Flat land
      return 0;
    }

    function createTile(x, z) {
      // Revert to lower geometry resolution for performance
      const geometry = new THREE.PlaneGeometry(tileSize, tileSize, 32, 32);
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        geometry.attributes.position.setZ(i, 0);
      }
      geometry.computeVertexNormals();
      // Load a repeating earth/dirt texture from local asset
      const texture = new THREE.TextureLoader().load(
        dirtImg,
        () => {
          renderer.render(scene, camera);
        },
        undefined,
        (err) => {
          console.error("Texture load error", err);
        }
      );
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      texture.encoding = THREE.sRGBEncoding;
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // Use a dirt-like fallback color
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0x8b7b5a, // dirt fallback
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x * tileSize, 0, z * tileSize);
      mesh.position.x = Math.round(mesh.position.x * 1e6) / 1e6;
      mesh.position.z = Math.round(mesh.position.z * 1e6) / 1e6;
      scene.add(mesh);
      return mesh;
    }

    function updateTiles(cx, cz) {
      const needed = new Set();
      for (let dx = -visibleRadius; dx <= visibleRadius; dx++) {
        for (let dz = -visibleRadius; dz <= visibleRadius; dz++) {
          const tx = Math.floor((cx + dx * tileSize) / tileSize);
          const tz = Math.floor((cz + dz * tileSize) / tileSize);
          // Only generate tiles within a circle radius
          const dist = Math.sqrt(
            (tx * tileSize - cx) ** 2 + (tz * tileSize - cz) ** 2
          );
          if (dist > visibleRadius * tileSize) continue;
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
          mesh.material.dispose();
          tiles.delete(key);
        }
      }
    }

    const color = 0xffffff;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(-1, 2, 4);
    scene.add(light);

    // Add ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Camera parameters for 2.5D effect
    let cameraZ = 0;
    let cameraX = 0;
    let cameraY = 15; // higher for a more isometric look
    const moveSpeed = 0.2;
    const keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      q: false,
      e: false,
      space: false,
    };
    let jumpY = 0;
    let jumpVelocity = 0;
    let isJumping = false;
    const jumpStrength = 0.5;
    const gravity = 0.025;

    function handleKeyDown(e) {
      if (e.key === "w") keys.w = true;
      if (e.key === "a") keys.a = true;
      if (e.key === "s") keys.s = true;
      if (e.key === "d") keys.d = true;
      if (e.key === "q") keys.q = true;
      if (e.key === "e") keys.e = true;
      if (e.code === "Space") keys.space = true;
    }
    function handleKeyUp(e) {
      if (e.key === "w") keys.w = false;
      if (e.key === "a") keys.a = false;
      if (e.key === "s") keys.s = false;
      if (e.key === "d") keys.d = false;
      if (e.key === "q") keys.q = false;
      if (e.key === "e") keys.e = false;
      if (e.code === "Space") keys.space = false;
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // FPS camera state
    let yaw = 0; // left/right
    let pitch = 0; // up/down
    const pitchLimit = Math.PI / 2 - 0.01;

    // Always add mousemove listener for FPS camera
    function onFPSMouseMove(e) {
      const sensitivity = 0.002;
      yaw -= e.movementX * sensitivity;
      pitch -= e.movementY * sensitivity;
      pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
    }
    document.addEventListener("mousemove", onFPSMouseMove);

    // Always request pointer lock on load and when pointer lock is lost
    function requestPointerLock() {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    }
    // Request pointer lock on load
    setTimeout(requestPointerLock, 0);
    // Request pointer lock again if lost
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) {
        setTimeout(requestPointerLock, 100);
      }
    });

    function cleanup() {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", onFPSMouseMove);
    }

    function render(time) {
      time *= 0.001;
      // Camera movement with WASD (move relative to FPS camera direction)
      let moveDX = 0,
        moveDZ = 0;
      const forwardX = Math.cos(yaw) * Math.cos(pitch);
      const forwardZ = Math.sin(yaw) * Math.cos(pitch);
      const rightX = Math.cos(yaw + Math.PI / 2);
      const rightZ = Math.sin(yaw + Math.PI / 2);
      if (keys.w) {
        moveDX += forwardX;
        moveDZ += forwardZ;
      }
      if (keys.s) {
        moveDX -= forwardX;
        moveDZ -= forwardZ;
      }
      if (keys.a) {
        moveDX -= rightX;
        moveDZ -= rightZ;
      }
      if (keys.d) {
        moveDX += rightX;
        moveDZ += rightZ;
      }
      // Normalize movement
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

      // Dynamically calculate visibleRadius based on camera FOV and height
      const camHeight = camY;
      const fovRad = (camera.fov * Math.PI) / 180;
      // Estimate max visible ground distance from camera height and FOV
      const groundDistance = camHeight * Math.tan(fovRad / 2) * 2;
      // Add margin for mouse look
      visibleRadius =
        Math.ceil((groundDistance * camera.aspect) / tileSize) + 4;
      visibleRadius = Math.min(visibleRadius, 12);
      // In render, update tiles based on camera position and new visibleRadius
      updateTiles(cameraX, cameraZ);

      renderer.render(scene, camera);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    return cleanup;
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: "100dvw", height: "100dvh", display: "block" }}
      ></canvas>
    </>
  );
}

export default App;
