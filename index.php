<?php
// Redirect to static index.html so live server uses index.html as the main file
header("Location: /index.html", true, 302);
?>
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/index.html"></head>
<body>
	If your browser does not redirect automatically, <a href="/index.html">click here to continue</a>.
</body>
</html>
