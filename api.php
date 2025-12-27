<?php
header('Content-Type: application/json');
$dbfile = __DIR__ . '/data/app.db';
if (!file_exists(dirname($dbfile))) @mkdir(dirname($dbfile), 0755, true);
$pdo = new PDO('sqlite:' . $dbfile);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec("CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT UNIQUE,
	displayName TEXT,
	avatarConfig TEXT,
	optInEncryptedTemplates INTEGER DEFAULT 0,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)");
$method = $_SERVER['REQUEST_METHOD'];
$path = isset($_GET['action']) ? $_GET['action'] : '';
function json($d){ echo json_encode($d); exit; }

if ($method === 'POST' && $path === 'create') {
	$payload = json_decode(file_get_contents('php://input'), true);
	if (empty($payload['username'])) json(['error'=>'username required']);
	$stmt = $pdo->prepare("INSERT OR IGNORE INTO users (username, displayName, avatarConfig, optInEncryptedTemplates) VALUES (:u,:d,:a,:o)");
	$stmt->execute([
		':u'=>$payload['username'],
		':d'=>$payload['displayName'] ?? $payload['username'],
		':a'=>json_encode($payload['avatarConfig'] ?? new stdClass()),
		':o'=>!empty($payload['optIn'])?1:0
	]);
	$id = $pdo->lastInsertId();
	json(['ok'=>true,'id'=>$id]);
}

if ($method === 'GET' && $path === 'get') {
	$username = $_GET['username'] ?? '';
	if (!$username) json(['error'=>'username required']);
	$stmt = $pdo->prepare("SELECT id,username,displayName,avatarConfig,optInEncryptedTemplates,createdAt FROM users WHERE username=:u");
	$stmt->execute([':u'=>$username]);
	$row = $stmt->fetch(PDO::FETCH_ASSOC);
	if (!$row) json(['error'=>'not found']);
	$row['avatarConfig'] = json_decode($row['avatarConfig'] ?: '{}', true);
	json($row);
}

if ($method === 'POST' && $path === 'update') {
	$payload = json_decode(file_get_contents('php://input'), true);
	if (empty($payload['username'])) json(['error'=>'username required']);
	$stmt = $pdo->prepare("UPDATE users SET displayName=:d, avatarConfig=:a, optInEncryptedTemplates=:o WHERE username=:u");
	$stmt->execute([
		':d'=>$payload['displayName'] ?? $payload['username'],
		':a'=>json_encode($payload['avatarConfig'] ?? new stdClass()),
		':o'=>!empty($payload['optIn'])?1:0,
		':u'=>$payload['username']
	]);
	json(['ok'=>true]);
}

if ($method === 'POST' && $path === 'reset') {
	$payload = json_decode(file_get_contents('php://input'), true);
	$username = $payload['username'] ?? '';
	if (!$username) json(['error'=>'username required']);
	$stmt = $pdo->prepare("DELETE FROM users WHERE username=:u");
	$stmt->execute([':u'=>$username]);
	// Server does not store raw biometric templates; client should remove them from IndexedDB.
	json(['ok'=>true]);
}

json(['error'=>'unsupported endpoint']);
?>
