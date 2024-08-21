// auth.js
let auth2;
let isSignedIn = false;

function onSignIn(googleUser) {
    isSignedIn = true;
    const profile = googleUser.getBasicProfile();
    console.log('ID: ' + profile.getId());
    console.log('Name: ' + profile.getName());
    console.log('Image URL: ' + profile.getImageUrl());
    console.log('Email: ' + profile.getEmail());
    
    document.getElementById('googleSignInButton').style.display = 'none';
    document.getElementById('signOutButton').style.display = 'inline-block';
    document.getElementById('startAppButton').style.display = 'inline-block';
}

function signOut() {
    if (auth2) {
        auth2.signOut().then(function () {
            console.log('User signed out.');
            isSignedIn = false;
            document.getElementById('googleSignInButton').style.display = 'block';
            document.getElementById('signOutButton').style.display = 'none';
            document.getElementById('startAppButton').style.display = 'none';
        });
    } else {
        console.error('auth2 not initialized. Unable to sign out.');
    }
}

function initAuth() {
    return new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined') {
            reject(new Error('Google API client not loaded'));
            return;
        }
        gapi.load('auth2', function() {
            gapi.auth2.init({
                client_id: '20635675841-uf569724tui760htgqqgebfi6echcoku.apps.googleusercontent.com',
                scope: 'profile email'
            }).then(() => {
                auth2 = gapi.auth2.getAuthInstance();
                isSignedIn = auth2.isSignedIn.get();
                console.log('Auth2 initialized successfully');
                auth2.isSignedIn.listen(updateSignInStatus);
                updateSignInStatus(auth2.isSignedIn.get());
                resolve(isSignedIn);
            }).catch(error => {
                console.error('Error initializing Google Sign-In:', error);
                console.error('Error details:', JSON.stringify(error, null, 2));
                reject(error);
            });
        });
    });
}

function updateSignInStatus(isSignedIn) {
    if (isSignedIn) {
        document.getElementById('googleSignInButton').style.display = 'none';
        document.getElementById('signOutButton').style.display = 'inline-block';
        document.getElementById('startAppButton').style.display = 'inline-block';
    } else {
        document.getElementById('googleSignInButton').style.display = 'block';
        document.getElementById('signOutButton').style.display = 'none';
        document.getElementById('startAppButton').style.display = 'none';
    }
}

function checkSignInStatus() {
    return initAuth();
}

// Call initAuth when the script loads
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initAuth().then((signedIn) => {
        console.log('Auth initialized, user signed in:', signedIn);
    }).catch((error) => {
        console.error('Auth initialization failed:', error);
    });
} else {
    window.addEventListener('load', function() {
        initAuth().then((signedIn) => {
            console.log('Auth initialized, user signed in:', signedIn);
        }).catch((error) => {
            console.error('Auth initialization failed:', error);
        });
    });
}

// Export functions and variables for use in other scripts
window.onSignIn = onSignIn;
window.signOut = signOut;
window.checkSignInStatus = checkSignInStatus;
window.isSignedIn = isSignedIn;