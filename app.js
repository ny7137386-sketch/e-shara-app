const API = "/api";
const demoProducts = [
    {id:"demo-1", name:"Sunrise Mitti Pot Set", maker:"Rani Kumari", price:680, category:"Mitti", image:"https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=700&q=80"},
    {id:"demo-2", name:"Handwoven Bamboo Basket", maker:"Mohan Lal", price:1250, category:"Bamboo", image:"https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=80"},
    {id:"demo-3", name:"Hand-painted Silk Dupatta", maker:"Farah Begum", price:890, category:"Silk", image:"https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=700&q=80"},
    {id:"demo-4", name:"Out-of-waste Gift Box", maker:"Meena & team", price:540, category:"Waste", image:"https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=700&q=80"}
];
let products = demoProducts;
let cartCount = Number(localStorage.getItem("e-shara-cart-count") || 0);
let selectedClinicId = null;
let cityIds = new Map();
const grid = document.querySelector("#product-grid");
const toast = document.querySelector("#toast");
let toastTimer;

function token() { return localStorage.getItem("e-shara-token"); }
function currentUser() {
    try { return JSON.parse(localStorage.getItem("e-shara-user") || "null"); } catch { return null; }
}
async function apiFetch(path, options = {}) {
    const headers = {"Content-Type": "application/json", ...(options.headers || {})};
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${API}${path}`, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong");
    return data;
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[character]));
}
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function setCartCount(value) {
    cartCount = value;
    localStorage.setItem("e-shara-cart-count", String(value));
    document.querySelector("#cart-count").textContent = value;
}
function renderProducts(category = "All") {
    grid.innerHTML = products.filter(product => category === "All" || product.category === category).map(product => `
        <article class="product">
            <div class="product-image" style="background-image:url('${escapeHtml(product.image || "")}')"><span>${escapeHtml(product.category)}</span></div>
            <div class="product-info"><h3>${escapeHtml(product.name)}</h3><div class="product-maker">Made by ${escapeHtml(product.maker || "e shara maker")}</div>
                <div class="product-bottom"><span class="price">₹${Number(product.price).toLocaleString("en-IN")}</span><button class="add-button" type="button" data-id="${escapeHtml(product.id)}" data-product="${escapeHtml(product.name)}">+ Add</button></div>
            </div>
        </article>`).join("");
    document.querySelectorAll(".add-button").forEach(button => button.addEventListener("click", async () => {
        if (!token() || currentUser()?.role !== "customer") {
            showToast("Please log in as a customer to add items.");
            openModal();
            return;
        }
        try {
            await apiFetch("/cart/items", {method:"POST", body:JSON.stringify({productId:button.dataset.id, quantity:1})});
            await refreshCart();
            showToast(`${button.dataset.product} added to your cart`);
        } catch (error) { showToast(error.message); }
    }));
}
async function loadProducts(category = "All") {
    try {
        const data = await apiFetch(`/products${category === "All" ? "" : `?category=${encodeURIComponent(category)}`}`);
        if (data.products.length) products = data.products;
    } catch { /* A static/demo view remains available without a configured database. */ }
    renderProducts(category);
}
async function refreshCart() {
    if (!token() || currentUser()?.role !== "customer") return;
    try {
        const data = await apiFetch("/cart");
        setCartCount(data.items.reduce((sum, item) => sum + Number(item.quantity), 0));
    } catch { setCartCount(0); }
}
loadProducts();
setCartCount(cartCount);
document.querySelectorAll(".category").forEach(button => button.addEventListener("click", () => {
    document.querySelector(".category.active")?.classList.remove("active");
    button.classList.add("active");
    loadProducts(button.dataset.category);
}));
document.querySelector("#cart-button").addEventListener("click", async () => {
    if (!token() || currentUser()?.role !== "customer") {
        showToast(cartCount ? `You have ${cartCount} item${cartCount > 1 ? "s" : ""} in your cart` : "Log in as a customer to use your cart.");
        return;
    }
    try {
        const data = await apiFetch("/cart");
        if (!data.items.length) return showToast("Your cart is empty. Explore handmade products!");
        const address = window.prompt(`Your cart total is ₹${Number(data.total).toLocaleString("en-IN")}. Enter a delivery address to place the order:`);
        if (!address) return;
        await apiFetch("/orders", {method:"POST", body:JSON.stringify({shippingAddress:address})});
        setCartCount(0);
        showToast("Order placed successfully. Thank you for supporting makers!");
    } catch (error) { showToast(error.message); }
});

async function showNearbyClinics(city) {
    const list = document.querySelector("#clinic-list");
    list.hidden = false;
    try {
        const cityId = cityIds.get(city.toLowerCase()) || city;
        const data = await apiFetch(`/clinics?cityId=${encodeURIComponent(cityId)}`);
        list.innerHTML = data.clinics.map((clinic, index) => `
            <button class="clinic-item" type="button" data-clinic-id="${escapeHtml(clinic.id)}" data-clinic="${escapeHtml(clinic.name)}">
                <span class="clinic-rank">${index + 1}</span><span><strong>${escapeHtml(clinic.name)}</strong><small>${escapeHtml(clinic.address)} · ${escapeHtml(clinic.phone || "Call clinic for timings")}</small></span>
            </button>`).join("");
        document.querySelector("#clinic-message").innerHTML = `${data.clinics.length} clinics near <strong>${escapeHtml(city)}</strong>. Select one to request an appointment.`;
        document.querySelectorAll(".clinic-item").forEach(item => item.addEventListener("click", () => {
            document.querySelectorAll(".clinic-item").forEach(clinic => clinic.classList.remove("selected"));
            item.classList.add("selected");
            selectedClinicId = item.dataset.clinicId;
            showToast(`${item.dataset.clinic} selected for your appointment.`);
        }));
    } catch {
        document.querySelector("#clinic-message").textContent = "Clinics are unavailable right now. Please try again later.";
    }
}
async function loadCities() {
    try {
        const data = await apiFetch("/cities");
        data.cities.forEach(city => cityIds.set(city.name.toLowerCase(), city.id));
    } catch { /* Keep the existing city choices as a useful offline view. */ }
}
loadCities();
document.querySelector("#appointment-button").addEventListener("click", async () => {
    if (!selectedClinicId) return showToast("Please select one of the nearby clinics first.");
    if (!token() || currentUser()?.role !== "customer") {
        showToast("Please log in as a customer to book an appointment.");
        openModal();
        return;
    }
    const dateInput = document.querySelector("#appointment-date");
    const date = dateInput.value || new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    try {
        await apiFetch("/appointments", {method:"POST", body:JSON.stringify({clinicId:selectedClinicId, appointmentDate:new Date(date).toISOString()})});
        showToast("Appointment request sent to the selected clinic.");
    } catch (error) { showToast(error.message); }
});
document.querySelector("#health-button").addEventListener("click", async () => {
    const city = document.querySelector("#city-select").value;
    if (!city) { showToast("Please choose your city to see nearby clinics."); document.querySelector("#city-select").focus(); return; }
    await showNearbyClinics(city);
    showToast(`Showing trusted clinics in ${city}.`);
});
document.querySelector("#gps-button").addEventListener("click", () => {
    const status = document.querySelector("#location-status");
    if (!navigator.geolocation) { status.textContent = "GPS is not supported by this browser. Please choose a city."; return showToast("GPS is not supported in this browser."); }
    status.textContent = "Finding your location… Please allow GPS permission.";
    navigator.geolocation.getCurrentPosition(async position => {
        let city = "your area";
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
            if (!response.ok) throw new Error("Location lookup failed");
            const data = await response.json();
            city = data.address.city || data.address.town || data.address.village || city;
        } catch { status.textContent = "GPS found, but city name could not be loaded. Please choose it below."; return showToast("Location found. Please choose a city from the list."); }
        const option = [...document.querySelector("#city-select").options].find(item => item.text.toLowerCase() === city.toLowerCase());
        if (option) document.querySelector("#city-select").value = option.value;
        status.textContent = `GPS location detected: ${city}`;
        await showNearbyClinics(city);
    }, () => { status.textContent = "GPS permission was not given. Please choose your city."; showToast("Please allow location access to find nearby clinics."); }, {enableHighAccuracy:true, timeout:10000});
});
document.querySelector("#view-all-button").addEventListener("click", () => { document.querySelector('[data-category="All"]').click(); document.querySelector("#shop").scrollIntoView({behavior:"smooth"}); });

const modal = document.querySelector("#login-modal");
function openModal() { modal.hidden = false; document.querySelector("#email").focus(); }
function closeModal() { modal.hidden = true; }
document.querySelector("#login-button").addEventListener("click", openModal);
document.querySelector("#seller-login-button").addEventListener("click", openModal);
document.querySelector(".modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
document.querySelector("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        const data = await apiFetch("/auth/login", {method:"POST", body:JSON.stringify({
            email:document.querySelector("#email").value.trim(),
            password:document.querySelector("#password").value,
            role:document.querySelector("#login-role").value || undefined
        })});
        localStorage.setItem("e-shara-token", data.token);
        localStorage.setItem("e-shara-user", JSON.stringify(data.user));
        closeModal();
        document.querySelector("#login-button").textContent = `Hi, ${data.user.name.split(" ")[0]}`;
        document.querySelector("#seller-login-button").textContent = data.user.role === "customer" ? "My account" : "Open my dashboard";
        await refreshCart();
        await loadProducts();
        showToast(`Welcome back, ${data.user.name}!`);
    } catch (error) { showToast(error.message); }
});

const managerModal = document.querySelector("#manager-modal");
const managerTitle = document.querySelector("#manager-title");
let managerType = "details";
function openManager(type, title) {
    if (!token() || !["seller", "admin"].includes(currentUser()?.role)) {
        showToast("Please log in as a seller or admin to manage this area.");
        return openModal();
    }
    managerType = type;
    managerTitle.textContent = title;
    const productFields = type === "product";
    document.querySelector("#manager-category-label").hidden = !productFields;
    document.querySelector("#manager-category").hidden = !productFields;
    document.querySelector("#manager-price-label").hidden = !productFields;
    document.querySelector("#manager-price").hidden = !productFields;
    document.querySelector("#manager-city-label").hidden = type !== "clinic";
    document.querySelector("#manager-city").hidden = type !== "clinic";
    document.querySelector("#manager-detail").placeholder = type === "delivery" ? "Phone number" : type === "clinic" ? "Clinic address" : "Description";
    managerModal.hidden = false;
    document.querySelector("#manager-name").focus();
}
document.querySelector("#add-product-button").addEventListener("click", () => openManager("product", "Add maker's product"));
document.querySelector("#delivery-button").addEventListener("click", () => openManager("delivery", "Add delivery partner"));
document.querySelector("#clinic-manager-button").addEventListener("click", () => openManager("clinic", "Add city clinic"));
document.querySelector(".manager-close").addEventListener("click", () => { managerModal.hidden = true; });
managerModal.addEventListener("click", event => { if (event.target === managerModal) managerModal.hidden = true; });
document.querySelector("#manager-form").addEventListener("submit", async event => {
    event.preventDefault();
    const name = document.querySelector("#manager-name").value.trim();
    const detail = document.querySelector("#manager-detail").value.trim();
    try {
        if (managerType === "product") {
            await apiFetch("/products", {method:"POST", body:JSON.stringify({name, description:detail, category:document.querySelector("#manager-category").value, price:Number(document.querySelector("#manager-price").value), stock:1})});
            await loadProducts();
        } else if (managerType === "delivery") {
            await apiFetch("/admin/delivery-partners", {method:"POST", body:JSON.stringify({name, phone:detail})});
        } else {
            const cityValue = document.querySelector("#manager-city").value.trim();
            const cityId = cityIds.get(cityValue.toLowerCase()) || cityValue;
            await apiFetch("/admin/clinics", {method:"POST", body:JSON.stringify({cityId, name, address:detail})});
        }
        managerModal.hidden = true;
        event.target.reset();
        showToast(`${name} saved successfully.`);
    } catch (error) { showToast(error.message); }
});

document.querySelector("#entertainment-button").addEventListener("click", () => showToast("Playing: “The wise old tree” — enjoy your story."));
document.querySelector("#care-button").addEventListener("click", () => showToast("A care partner will call you shortly."));
document.querySelector("#learn-button").addEventListener("click", () => { document.querySelector("#learn").scrollIntoView({behavior:"smooth"}); showToast("Choose a friendly lesson to begin learning."); });
document.querySelectorAll(".lesson").forEach(lesson => lesson.addEventListener("click", () => showToast(`${lesson.dataset.lesson} lesson selected. Your learning partner will guide you.`)));
const voiceButton = document.querySelector("#voice-button");
const voiceStatus = document.querySelector("#voice-status");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    voiceButton.addEventListener("click", () => { voiceStatus.textContent = "Listening…"; voiceButton.classList.add("listening"); recognition.start(); });
    recognition.addEventListener("result", event => {
        const command = event.results[0][0].transcript.toLowerCase();
        voiceStatus.textContent = `Heard: “${command}”`;
        if (command.includes("shop") || command.includes("product")) document.querySelector("#shop").scrollIntoView({behavior:"smooth"});
        else if (command.includes("doctor") || command.includes("health") || command.includes("medical")) document.querySelector("#health-support").scrollIntoView({behavior:"smooth"});
        else if (command.includes("learn") || command.includes("skill")) document.querySelector("#learn").scrollIntoView({behavior:"smooth"});
        else if (command.includes("music") || command.includes("story") || command.includes("entertain")) document.querySelector("#entertainment-button").click();
        else showToast("Please say: open shop, find doctor, learn skill, or play story.");
    });
    recognition.addEventListener("end", () => voiceButton.classList.remove("listening"));
    recognition.addEventListener("error", () => { voiceButton.classList.remove("listening"); voiceStatus.textContent = "Voice help is ready to try again"; showToast("Please allow microphone access to use voice help."); });
} else {
    voiceStatus.textContent = "Tap for simple help options";
    voiceButton.addEventListener("click", () => showToast("Voice help is not supported in this browser. Please use the buttons below."));
}
