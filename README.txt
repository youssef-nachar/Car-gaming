STREET RACING 41000 - Graphics Edition
Run: serve this folder over HTTPS/HTTP (e.g. any static host or "npx serve"), open index.html on the big screen,
scan the QR code with phones (controller.html). Host keys: WASD/Arrows drive, SHIFT nitro, N day/night, C camera view (chase / first person).
Phone controller: drag the wheel, hold GAS / BRAKE / NITRO, VIEW switches camera, STEERING sets wheel sensitivity, ⇄ swaps sides for left-handed play.
Steering uses a real-car model: front wheels, steering wheel and the car's path all follow the same steering angle (less lock at high speed).
Lives: each driver has 6 hearts. A real hit (a car driving into another) takes 1 heart from the driver who was hit; 0 hearts = wrecked for 5 s, then back with 3 hearts. A life pickup appears on a road every 20 s (it stays until a driver who lost hearts drives over it). Change MAX_LIVES / RESPAWN_LIVES / PICKUP_EVERY / WRECK_TIME at the top of game.js.
First person: press C or the camera button, VIEW on the phone controller, or add ?fp to the URL.
Add ?night to the URL to start at night. Needs internet for Three.js, PeerJS and QRCode CDNs.
