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
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
        console.log('User signed out.');
        isSignedIn = false;
        document.getElementById('googleSignInButton').style.display = 'block';
        document.getElementById('signOutButton').style.display = 'none';
        document.getElementById('startAppButton').style.display = 'none';
    });
}

function checkSignInStatus() {
    return new Promise((resolve, reject) => {
        gapi.load('auth2', function() {
            gapi.auth2.init({
                client_id: '20635675841-uf569724tui760htgqgqebfi6echcoku.apps.googleusercontent.com'
            }).then(() => {
                auth2 = gapi.auth2.getAuthInstance();
                isSignedIn = auth2.isSignedIn.get();
                resolve(isSignedIn);
            }).catch(error => {
                console.error('Error initializing Google Sign-In:', error);
                reject(error);
            });
        });
    });
}

// Export functions and variables for use in other scripts
window.onSignIn = onSignIn;
window.signOut = signOut;
window.checkSignInStatus = checkSignInStatus;
window.isSignedIn = isSignedIn;