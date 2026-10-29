import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";


// ======================================================
// GLOBAL VARIABLES
// ======================================================

let scene;
let camera;
let renderer;
let controls;
let clock;

let mixer;

let streetModel;
let character;
let coinTemplate;
let coinPickups = [];
let pocket = [];
let pocketCount;
let coinsPlaced = false;
let coinModelScale = 1;
let coinBottomOffset = 0;
let coinSpawnTimer = 0;
let nextCoinId = 1;

let animations = {};
let actionSelect;
let actionButton;

let currentAction;
let currentState = "walking";
let actionCompletion = "";
let resumeState = "walking";

const STREET_START = -40;
const STREET_END = 40;

const STREET_SCALE = 0.1;
const STREET_END_MARGIN = 4;
const CHARACTER_SCALE = 3;
const COIN_COUNT = 14;
const MAX_ACTIVE_COINS = 20;
const COIN_SPAWN_INTERVAL = 2.5;
const COIN_DISPLAY_HEIGHT = 2.4;
const COIN_PICKUP_DISTANCE = 2.5;

let direction = 1;
let travelAxis = "z";
let travelStart = STREET_START;
let travelEnd = STREET_END;
let laneCoordinate = 0;
let characterGroundOffset = 0;
let patrolStarted = false;
let streetBounds;

const raycaster = new THREE.Raycaster();


// ======================================================
// INITIALIZATION
// ======================================================

initializeScene();
loadStreetModel();
loadCharacterModel();
loadCoinModel();

animate();


// ======================================================
// SCENE SETUP
// ======================================================

function initializeScene()
{
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 15, 35);

    renderer = new THREE.WebGLRenderer({
        antialias:true
    });

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(
        camera,
        renderer.domElement
    );

    controls.target.set(0, 5, 0);
    controls.update();

    clock = new THREE.Clock();

    actionSelect = document.getElementById("action-select");
    actionButton = document.getElementById("action-play");
    pocketCount = document.getElementById("pocket-count");
    actionButton.addEventListener("click", playSelectedAnimation);

    addLights();

    window.addEventListener(
        "resize",
        onWindowResize
    );
}


// ======================================================
// LIGHTING
// ======================================================

function addLights()
{
    const ambient = new THREE.AmbientLight(
        0xffffff,
        2
    );

    scene.add(ambient);

    const sun = new THREE.DirectionalLight(
        0xffffff,
        3
    );

    sun.position.set(25,40,20);

    scene.add(sun);
}


// ======================================================
// LOAD STREET
// ======================================================

function loadStreetModel()
{
    const loader = new GLTFLoader();

    loader.load(
        "model/simplestreet.glb",

        (gltf)=>
        {
            streetModel = gltf.scene;

            streetModel.scale.setScalar(STREET_SCALE);

            scene.add(streetModel);
            streetModel.updateMatrixWorld(true);
            setupPatrolPath();
        }
    );
}


// ======================================================
// LOAD CHARACTER
// ======================================================

function loadCharacterModel()
{
    const loader = new GLTFLoader();

    loader.load(
        "model/character.glb",

        (gltf)=>
        {
            character = gltf.scene;
            character.scale.setScalar(CHARACTER_SCALE);

            character.position.set(
                STREET_START,
                0,
                0
            );

            scene.add(character);

            setupAnimations(gltf);
            setupPatrolPath();
        }
    );
}


// ======================================================
// LOAD COIN MODEL
// ======================================================

function loadCoinModel()
{
    const loader = new GLTFLoader();

    loader.load(
        "model/goldcoin.glb",
        (gltf)=>
        {
            coinTemplate = gltf.scene;
            setupCoins();
        }
    );
}


// ======================================================
// STORE ALL ANIMATIONS
// ======================================================

function setupAnimations(gltf)
{
    mixer = new THREE.AnimationMixer(
        character
    );

    gltf.animations.forEach((clip)=>
    {
        animations[clip.name] =
            mixer.clipAction(clip);

        const option = document.createElement("option");
        option.value = clip.name;
        option.textContent = clip.name.split("|").pop().replaceAll("_", " ");
        actionSelect.appendChild(option);
    });

    actionSelect.disabled = false;
    actionButton.disabled = false;
    mixer.addEventListener("finished", onAnimationFinished);

    console.log(
        "Animations Found:",
        Object.keys(animations)
    );

    playWalkAnimation();
}


// ======================================================
// PLAY ANIMATION HELPER
// ======================================================

function playAnimation(name, loop=true)
{
    if(!animations[name]) return;

    if(currentAction)
    {
        currentAction.fadeOut(0.3);
    }

    currentAction = animations[name];

    currentAction.reset();

    currentAction.setLoop(
        loop ?
        THREE.LoopRepeat :
        THREE.LoopOnce
    );

    currentAction.clampWhenFinished = true;

    currentAction.fadeIn(0.3);

    currentAction.play();
}


// ======================================================
// WALK
// ======================================================

function playWalkAnimation()
{
    const walkClip =
        findAnimation(["walk","walking"]);

    if(walkClip)
    {
        playAnimation(walkClip);
    }

    currentState = "walking";
}


// ======================================================
// RUN
// ======================================================

function playRunAnimation()
{
    const runClip =
        findAnimation(["run","running"]);

    if(runClip)
    {
        playAnimation(runClip);
    }

    currentState = "running";
}


// ======================================================
// PICK RANDOM ANIMATION
// ======================================================

function performRandomAnimation()
{
    const names =
        Object.keys(animations);

    const filtered = names.filter(
        name =>
            !name.toLowerCase().includes("walk") &&
            !name.toLowerCase().includes("run")
    );

    if(filtered.length === 0)
    {
        turnAroundAndRun();
        return;
    }

    const randomName =
        filtered[
            Math.floor(
                Math.random() *
                filtered.length
            )
        ];

    currentState = "performing";
    actionCompletion = "turnaround";
    playAnimation(randomName, false);
}


// ======================================================
// PLAY A SELECTED CLIP
// ======================================================

function playSelectedAnimation()
{
    const name = actionSelect.value;
    const lowerName = name.toLowerCase();

    if(!name || !animations[name])
        return;

    if(lowerName.includes("walk") || lowerName.includes("run"))
    {
        actionCompletion = "";
        if(lowerName.includes("run"))
        {
            playAnimation(name);
            currentState = "running";
        }
        else
        {
            playAnimation(name);
            currentState = "walking";
        }
        return;
    }

    resumeState = currentState === "performing" ? "walking" : currentState;
    currentState = "performing";
    actionCompletion = "resume";
    playAnimation(name, false);
}


function onAnimationFinished(event)
{
    if(event.action !== currentAction)
        return;

    const completion = actionCompletion;
    actionCompletion = "";

    if(completion === "turnaround")
    {
        turnAroundAndRun();
    }
    else if(completion === "resume")
    {
        if(resumeState === "running")
            playRunAnimation();
        else
            playWalkAnimation();
    }
}


// ======================================================
// TURN CHARACTER
// ======================================================

function turnAround()
{
    direction *= -1;
    character.rotation.y =
        travelAxis === "x"
            ? direction * Math.PI / 2
            : direction < 0 ? Math.PI : 0;
}


// ======================================================
// TURN THEN RUN
// ======================================================

function turnAroundAndRun()
{
    turnAround();

    playRunAnimation();

    currentState = "running";
}


// ======================================================
// FIND CLIP BY NAME
// ======================================================

function findAnimation(keywords)
{
    const names =
        Object.keys(animations);

    for(const name of names)
    {
        const lower =
            name.toLowerCase();

        for(const word of keywords)
        {
            if(lower.includes(word))
            {
                return name;
            }
        }
    }

    return names[0];
}


// ======================================================
// CHARACTER MOVEMENT
// ======================================================

function updateCharacter(delta)
{
    if(!character || !patrolStarted) return;

    if(currentState === "performing")
    {
        keepCharacterOnStreet();
        return;
    }

    let speed = 4;

    if(currentState === "running")
    {
        speed = 8;
    }

    if(currentState === "walking")
    {
        speed = 4;
    }

    character.position[travelAxis] += speed * direction * delta;

    const position = character.position[travelAxis];
    character.position[travelAxis] = THREE.MathUtils.clamp(
        position,
        travelStart,
        travelEnd
    );

    keepCharacterOnStreet();

    checkStreetEnds();
}


// ======================================================
// KEEP CHARACTER ON GROUND
// ======================================================

function keepCharacterOnStreet()
{
    if(!streetModel || !character || !streetBounds)
        return;

    const surfaceHeight = getStreetSurfaceHeight(
        character.position.x,
        character.position.z
    );

    if(surfaceHeight !== null)
    {
        character.position.y =
            surfaceHeight - characterGroundOffset;
    }
}


function getStreetSurfaceHeight(x, z)
{
    if(!streetModel || !streetBounds)
        return null;

    const startPoint = new THREE.Vector3(
        x,
        streetBounds.max.y + 20,
        z
    );

    raycaster.set(startPoint, new THREE.Vector3(0, -1, 0));

    const hits = raycaster.intersectObject(streetModel, true);
    return hits.length > 0 ? hits[0].point.y : null;
}


// ======================================================
// SET UP THE STREET COLLISION PATH
// ======================================================

function setupPatrolPath()
{
    if(!streetModel || !character || patrolStarted)
        return;

    streetBounds = new THREE.Box3().setFromObject(streetModel);
    const streetSize = streetBounds.getSize(new THREE.Vector3());
    const streetCenter = streetBounds.getCenter(new THREE.Vector3());

    travelAxis = streetSize.x > streetSize.z ? "x" : "z";
    const minimum = travelAxis === "x" ? streetBounds.min.x : streetBounds.min.z;
    const maximum = travelAxis === "x" ? streetBounds.max.x : streetBounds.max.z;
    travelStart = minimum + STREET_END_MARGIN;
    travelEnd = maximum - STREET_END_MARGIN;
    laneCoordinate = travelAxis === "x" ? streetCenter.z : streetCenter.x;

    const characterBounds = new THREE.Box3().setFromObject(character);
    characterGroundOffset = characterBounds.min.y - character.position.y;

    character.position[travelAxis] = travelStart;
    character.position[travelAxis === "x" ? "z" : "x"] = laneCoordinate;
    direction = 1;
    character.rotation.y = travelAxis === "x" ? Math.PI / 2 : 0;
    patrolStarted = true;

    camera.position.set(
        streetCenter.x + streetSize.x * 0.8,
        streetCenter.y + Math.max(streetSize.x, streetSize.z) * 0.8,
        streetCenter.z + streetSize.z * 0.8
    );
    controls.target.copy(streetCenter);
    controls.update();
    keepCharacterOnStreet();
    setupCoins();
}


// ======================================================
// PLACE RANDOM COINS ON THE PATROL PATH
// ======================================================

function setupCoins()
{
    if(!coinTemplate || !patrolStarted || coinsPlaced)
        return;

    const templateBounds = new THREE.Box3().setFromObject(coinTemplate);
    const templateHeight = templateBounds.getSize(new THREE.Vector3()).y;
    coinModelScale = COIN_DISPLAY_HEIGHT / templateHeight;
    coinBottomOffset = templateBounds.min.y * coinModelScale;

    for(let index = 0; index < COIN_COUNT; index++)
        spawnRandomCoin();

    coinsPlaced = true;
}


function spawnRandomCoin()
{
    if(!coinTemplate || coinPickups.length >= MAX_ACTIVE_COINS)
        return;

    const routeLength = travelEnd - travelStart;

    for(let attempt = 0; attempt < 10; attempt++)
    {
        const coin = coinTemplate.clone(true);
        const alongPath = travelStart + 4 + Math.random() * (routeLength - 8);
        const acrossPath = laneCoordinate + (Math.random() - 0.5) * 2;
        const x = travelAxis === "x" ? alongPath : acrossPath;
        const z = travelAxis === "z" ? alongPath : acrossPath;
        const surfaceHeight = getStreetSurfaceHeight(x, z);

        if(surfaceHeight === null)
            continue;

        if(character && Math.hypot(character.position.x - x, character.position.z - z) < COIN_PICKUP_DISTANCE * 2)
            continue;

        coin.scale.setScalar(coinModelScale);
        coin.position.set(x, surfaceHeight - coinBottomOffset, z);
        coin.userData.coinId = nextCoinId++;
        scene.add(coin);
        coinPickups.push(coin);
        return;
    }
}


// ======================================================
// CHECK FOR COIN PICKUPS
// ======================================================

function updateCoins(delta)
{
    if(!character)
        return;

    for(let index = coinPickups.length - 1; index >= 0; index--)
    {
        const coin = coinPickups[index];
        coin.rotation.y += delta;

        const dx = character.position.x - coin.position.x;
        const dz = character.position.z - coin.position.z;

        if(dx * dx + dz * dz <= COIN_PICKUP_DISTANCE * COIN_PICKUP_DISTANCE)
            collectCoin(index);
    }

    coinSpawnTimer += delta;
    if(coinSpawnTimer >= COIN_SPAWN_INTERVAL)
    {
        coinSpawnTimer = 0;
        spawnRandomCoin();
    }
}


function collectCoin(index)
{
    const [coin] = coinPickups.splice(index, 1);
    scene.remove(coin);
    pocket.push(coin);
    pocketCount.textContent = `Coins collected: ${pocket.length}`;
}


// ======================================================
// END OF STREET
// ======================================================

function checkStreetEnds()
{
    const position = character.position[travelAxis];

    if((direction > 0 && position >= travelEnd - 0.001) ||
       (direction < 0 && position <= travelStart + 0.001))
    {
        currentState = "performing";

        performRandomAnimation();
    }
}


// ======================================================
// RENDER LOOP
// ======================================================

function animate()
{
    requestAnimationFrame(
        animate
    );

    const delta =
        clock.getDelta();

    if(mixer)
    {
        mixer.update(delta);
    }

    updateCharacter(delta);
    updateCoins(delta);

    renderer.render(
        scene,
        camera
    );
}


// ======================================================
// RESIZE
// ======================================================

function onWindowResize()
{
    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}