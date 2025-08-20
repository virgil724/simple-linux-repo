export function getWebInterface(origin: string = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Linux Repository Manager</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            max-width: 500px;
            width: 100%;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        
        input[type="text"],
        input[type="file"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e8ed;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }
        
        input[type="file"] {
            padding: 10px;
            background: #f8f9fa;
        }
        
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        
        button:hover:not(:disabled) {
            transform: translateY(-2px);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }
        
        .alert.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .usage {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e1e8ed;
        }
        
        .usage h3 {
            color: #333;
            font-size: 18px;
            margin-bottom: 15px;
        }
        
        .code {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #333;
            margin-bottom: 10px;
            word-break: break-all;
        }
        
        .qr-section {
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            text-align: center;
        }
        
        .qr-section h3 {
            color: #333;
            margin-bottom: 10px;
            font-size: 16px;
        }
        
        .qr-placeholder {
            display: inline-block;
            padding: 20px;
            background: white;
            border: 2px dashed #ccc;
            border-radius: 8px;
            color: #999;
            font-size: 12px;
        }
        
        .loading {
            display: none;
            text-align: center;
            color: #667eea;
        }
        
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(102, 126, 234, 0.3);
            border-radius: 50%;
            border-top-color: #667eea;
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🐧 Linux Repository</h1>
        <p class="subtitle">Upload .deb packages with TOTP authentication</p>
        
        <div class="alert" id="alert"></div>
        
        <form id="uploadForm">
            <div class="form-group">
                <label for="totp">TOTP Code</label>
                <input type="text" id="totp" name="totp" placeholder="Enter 6-digit code" maxlength="6" pattern="[0-9]{6}" required>
            </div>
            
            <div class="form-group">
                <label for="package">Package File (.deb)</label>
                <input type="file" id="package" name="package" accept=".deb" required>
            </div>
            
            <button type="submit" id="submitBtn">
                <span id="btnText">Upload Package</span>
                <span class="loading" id="loading">
                    <span class="spinner"></span> Uploading...
                </span>
            </button>
        </form>
        
        <div class="usage">
            <h3>📦 Repository Usage</h3>
            <p style="margin-bottom: 15px; color: #666;">Add this repository to your system:</p>
            <div class="code">
                echo "deb ${origin || '[YOUR-REPO-URL]'}/ stable main" | sudo tee /etc/apt/sources.list.d/custom.list
            </div>
            <div class="code">
                sudo apt update && sudo apt install [package-name]
            </div>
        </div>
        
        <div class="qr-section">
            <h3>🔐 TOTP Setup</h3>
            <div class="qr-placeholder">
                QR code for authenticator app<br>
                (Configure TOTP_SECRET in worker)
            </div>
        </div>
    </div>
    
    <script>
        const form = document.getElementById('uploadForm');
        const alert = document.getElementById('alert');
        const submitBtn = document.getElementById('submitBtn');
        const btnText = document.getElementById('btnText');
        const loading = document.getElementById('loading');
        const totpInput = document.getElementById('totp');
        
        // Auto-focus TOTP input
        totpInput.focus();
        
        // Format TOTP input
        totpInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            
            // Validate file
            const file = formData.get('package');
            if (!file || !file.name.endsWith('.deb')) {
                showAlert('Please select a valid .deb package file', 'error');
                return;
            }
            
            // Show loading state
            submitBtn.disabled = true;
            btnText.style.display = 'none';
            loading.style.display = 'inline-block';
            hideAlert();
            
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert(result.message || 'Package uploaded successfully!', 'success');
                    form.reset();
                    totpInput.focus();
                } else {
                    showAlert(result.error || 'Upload failed', 'error');
                }
            } catch (error) {
                showAlert('Network error. Please try again.', 'error');
                console.error('Upload error:', error);
            } finally {
                // Reset button state
                submitBtn.disabled = false;
                btnText.style.display = 'inline';
                loading.style.display = 'none';
            }
        });
        
        function showAlert(message, type) {
            alert.textContent = message;
            alert.className = 'alert ' + type;
            alert.style.display = 'block';
            
            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(hideAlert, 5000);
            }
        }
        
        function hideAlert() {
            alert.style.display = 'none';
        }
    </script>
</body>
</html>`;
}