import { useRef, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import dirtImg from "/dirt.jpg";

function App() {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;

    const fov = 75;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const near = 0.1;
    const far = 1000;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light (for sunlight and shadows)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 200, 100);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // Load GLTF
    const loader = new GLTFLoader();
    let mixer;
    let characterModel;
    let actions = {}; // Store animation actions
    let activeAction; // Keep track of the currently playing action

    loader.load('/char.glb', (gltf) => {
      characterModel = gltf.scene;
      characterModel.scale.set(10, 10, 10);
      characterModel.rotation.y = Math.PI;
      const object4 = characterModel.getObjectByName('Object_4');
      if (object4) {
        object4.traverse((node) => {
          if (node.isMesh && (node.name === 'Object_10' || node.name === 'Object_11')) {
            node.visible = false;
          }
        });
      }
      characterModel.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
      });

      scene.add(characterModel);

      mixer = new THREE.AnimationMixer(characterModel);
      gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          actions[clip.name] = action;
      });

      if (actions['motion']) {
          activeAction = actions['motion'];
      } else if (gltf.animations.length > 0) {
          activeAction = actions[gltf.animations[0].name];
      }
    }, undefined, (error) => {
        console.error('Error loading GLTF:', error);
    });

    const tileSize = 100;
    const visibleRadius = 20;
    const tiles = new Map();

    const texture = new THREE.TextureLoader().load(dirtImg);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.encoding = THREE.sRGBEncoding;

    const tileMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0x8b7b5a,
      side: THREE.DoubleSide,
    });
    tileMaterial.receiveShadow = true;

    function tileKey(x, z) {
      return `${x}_${z}`;
    }

    function createTile(x, z) {
      const geometry = new THREE.PlaneGeometry(tileSize, tileSize, 1, 1);
      const mesh = new THREE.Mesh(geometry, tileMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x * tileSize, 0, z * tileSize);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    }

    function updateTiles(cx, cz) {
      const needed = new Set();
      const cameraTileX = Math.floor(cx / tileSize);
      const cameraTileZ = Math.floor(cz / tileSize);

      for (let i = -visibleRadius; i <= visibleRadius; i++) {
        for (let j = -visibleRadius; j <= visibleRadius; j++) {
          if (i * i + j * j > visibleRadius * visibleRadius) continue;
          const tx = cameraTileX + i;
          const tz = cameraTileZ + j;
          const key = tileKey(tx, tz);
          needed.add(key);
          if (!tiles.has(key)) {
            tiles.set(key, createTile(tx, tz));
          }
        }
      }

      for (const [key, mesh] of tiles.entries()) {
        if (!needed.has(key)) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          tiles.delete(key);
        }
      }
    }

    let cameraX = 0;
    let cameraZ = 0;
    const moveSpeed = 2.5;
    const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
    let jumpY = 0;
    let jumpVelocity = 0;
    let isJumping = false;
    const jumpStrength = 3.5;
    const gravity = 0.1;

    let isThirdPerson = false;
    let isSprinting = false;

    function handleKeyDown(e) {
      const key = e.key.toLowerCase();
      if (key in keys) keys[key] = true;
      if (e.code === "Space") keys.space = true;
      if (e.key === "Shift") isSprinting = true;
      if (e.key === "Tab") {
        e.preventDefault();
        isThirdPerson = !isThirdPerson;
        if (characterModel) {
          const object4 = characterModel.getObjectByName('Object_4');
          if (object4) {
            object4.traverse((node) => {
              if (node.isMesh && (node.name === 'Object_10' || node.name === 'Object_11')) {
                node.visible = isThirdPerson;
                characterModel.visible = isThirdPerson;
                characterModel.castShadow = isThirdPerson; 
              }
            });
          }
        }
      }
    }
    function handleKeyUp(e) {
      const key = e.key.toLowerCase();
      if (key in keys) keys[key] = false;
      if (e.code === "Space") keys.space = false;
      if (e.key === "Shift") isSprinting = false;
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let yaw = 0;
    let pitch = 0;
    const pitchLimit = Math.PI / 2 - 0.1;

    function onMouseMove(e) {
      if (document.pointerLockElement !== canvas) return;
      const sensitivity = 0.0075;
      yaw -= e.movementX * sensitivity;
      pitch -= e.movementY * sensitivity;
      pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
    }
    document.addEventListener("mousemove", onMouseMove);

    function requestPointerLock() {
      canvas.requestPointerLock();
    }
    canvas.addEventListener("click", requestPointerLock);

    function handleResize() {
      const pixelRatio = window.devicePixelRatio;
      const width = (canvas.clientWidth * pixelRatio) | 0;
      const height = (canvas.clientHeight * pixelRatio) | 0;
      if (canvas.width !== width || canvas.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
      }
    }
    window.addEventListener("resize", handleResize);
    handleResize();

    function cleanup() {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", requestPointerLock);
      tileMaterial.dispose();
      texture.dispose();
    }

    let lastCameraTileX = -Infinity;
    let lastCameraTileZ = -Infinity;
    const clock = new THREE.Clock();

    function render() {
      const delta = clock.getDelta();

      let moveDX = 0,
        moveDZ = 0;
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const rightX = Math.sin(yaw + Math.PI / 2);
      const rightZ = Math.cos(yaw + Math.PI / 2);

      if (keys.s) {
        moveDX -= forwardX;
        moveDZ -= forwardZ;
      }
      if (keys.w) {
        moveDX += forwardX;
        moveDZ += forwardZ;
      }
      if (keys.d) {
        moveDX -= rightX;
        moveDZ -= rightZ;
      }
      if (keys.a) {
        moveDX += rightX;
        moveDZ += rightZ;
      }

      if (moveDX !== 0 || moveDZ !== 0) {
        const len = Math.sqrt(moveDX * moveDX + moveDZ * moveDZ);
        const currentSpeed = isSprinting ? moveSpeed * 3 : moveSpeed;
        cameraX += (moveDX / len) * currentSpeed;
        cameraZ += (moveDZ / len) * currentSpeed;
      }

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

      const camY = 210 + jumpY;
      if (characterModel) {
        characterModel.position.set(cameraX, camY - 21, cameraZ - 3);
        characterModel.rotation.y = yaw;
      }

      if (isThirdPerson) {
        camera.position.set(cameraX, camY, cameraZ + 30);

        const lookAtX = cameraX + Math.sin(yaw) * Math.cos(pitch);
        const lookAtY = camY + Math.sin(pitch);
        const lookAtZ = cameraZ + Math.cos(yaw) * Math.cos(pitch);
        camera.lookAt(lookAtX, lookAtY, lookAtZ);
      } else {
        camera.position.set(cameraX, camY + 2, cameraZ - 1.4);
        
        const lookAtX = cameraX + Math.sin(yaw) * Math.cos(pitch);
        const lookAtY = camY + Math.sin(pitch);
        const lookAtZ = cameraZ + Math.cos(yaw) * Math.cos(pitch);
        camera.lookAt(lookAtX, lookAtY, lookAtZ);
      }

      if (mixer) {
        mixer.update(delta);

        if (activeAction) {
          if (moveDX !== 0 || moveDZ !== 0) {
            // Moving
            activeAction.timeScale = isSprinting ? 3 : 1;
            if (!activeAction.isRunning()) {
              activeAction.play();
            }
          } else {
            // Idle
            if (activeAction.isRunning()) {
              activeAction.stop();
            }
          }
        }
      }

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

    updateTiles(cameraX, cameraZ);
    requestAnimationFrame(render);

    return cleanup;
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-[100dvw] h-[100dvh] block"
      ></canvas>
      <div
        className="absolute top-0 right-0 bg-[rgba(0,0,0,0.5)] color-white p-[2rem] rounded-sm flex flex-col gap-5"
      >
        <div className="text-[0.8rem] text-[#ccc] text-center">
          Click to lock mouse, then look around.
        </div>
        <div className="flex gap-5">
          <div className="flex flex-col justify-between gap-5">
            <div>
              <kbd
                style={{
                  padding: "0.5rem 1.5rem",
                  border: "1px solid white",
                  borderRadius: "4px",
                }}
              >
                TAB
              </kbd>
            </div>

            <div>
              <kbd
                style={{
                  padding: "0.5rem 1.5rem",
                  border: "1px solid white",
                  borderRadius: "4px",
                }}
              >
                L SHIFT
              </kbd>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-5">
            <div>
              <div className="flex flex-col gap-3">
                <div className="flex justify-center">
                  <kbd
                    style={{
                      padding: "0.5rem 0.75rem",
                      border: "1px solid white",
                      borderRadius: "4px",
                    }}
                  >
                    W
                  </kbd>
                </div>
                <div className="flex gap-3">
                  <kbd
                    style={{
                      padding: "0.5rem 0.75rem",
                      border: "1px solid white",
                      borderRadius: "4px",
                    }}
                  >
                    A
                  </kbd>

                  <kbd
                    style={{
                      padding: "0.5rem 0.75rem",
                      border: "1px solid white",
                      borderRadius: "4px",
                    }}
                  >
                    S
                  </kbd>

                  <kbd
                    style={{
                      padding: "0.5rem 0.75rem",
                      border: "1px solid white",
                      borderRadius: "4px",
                    }}
                  >
                    D
                  </kbd>
                </div>
              </div>
            </div>

            <div>
              <kbd
                className="text-center"
                style={{
                  padding: "0.5rem 1.5rem",
                  border: "1px solid white",
                  borderRadius: "4px",
                }}
              >
                SPACE
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;