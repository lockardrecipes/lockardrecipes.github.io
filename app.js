/* Mom's Recipe Box — GitHub Pages front end + optional Supabase shared database */
(() => {
  const CONFIG = window.RECIPE_APP_CONFIG || {};
  const hasSupabase = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
  const db = hasSupabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
 const categories = [
  ["course","Course"],
  ["cook_method","Cook Method"],
  ["effort","Effort"],
  ["cuisine","Cuisine"],
  ["collection","Collection"],
  ["favorites","Favorites"]
];
  const IMAGE_CACHE_KEY = "moms-recipe-box-image-cache-v2";
  let recipes = [], activeFilters = {}, view = "grid", currentRecipe = null, toastTimer;
  let imageCache = readImageCache();
  const imageQueue = [];
  let imageWorkers = 0;
  const $ = id => document.getElementById(id);
  const escapeHtml = (value="") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalize = value => String(value || "").trim().toLowerCase();
  const displayTag = (key, value) => key === "favorites" ? `${String(value).trim()}'s favorite` : value;
  const tags = value => Array.isArray(value) ? value : (value ? String(value).split(",").map(x=>x.trim()).filter(Boolean) : []);
  const toRecipe = row => ({
    id: row.id ?? null, name: row.name || "", url: row.url || "", photo_url: row.photo_url || "",
    cook_method: tags(row.cook_method), effort: tags(row.effort), favorites: tags(row.favorites),
    course: tags(row.course), collection: tags(row.collection), cuisine: tags(row.cuisine),
    ingredients: row.ingredients || "", instructions: row.instructions || ""
  });
  function readImageCache(){try{return JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY)||"{}")}catch{return {}}}
  function saveImageCache(){try{localStorage.setItem(IMAGE_CACHE_KEY,JSON.stringify(imageCache))}catch{}}
  function notify(message) {
    const toast = $("toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>toast.classList.remove("show"), 2800);
  }
  function allTags(key) { return [...new Set(recipes.flatMap(r=>r[key] || []))].sort((a,b)=>a.localeCompare(b)); }
  function renderFilters() {
    $("filterGrid").innerHTML = categories.map(([key,label]) => {
      const options = allTags(key).map(v=>`<option value="${escapeHtml(v)}" ${activeFilters[key]===v?"selected":""}>${escapeHtml(displayTag(key,v))}</option>`).join("");
      return `<div class="filter-group"><label for="filter-${key}">${label}</label><select id="filter-${key}" data-filter="${key}"><option value="">${key === "favorites" ? "All favorites" : `All ${label.toLowerCase()}s`}</option>${options}</select></div>`;
    }).join("");
    $("filterGrid").querySelectorAll("select").forEach(el=>el.addEventListener("change",e=>{
      activeFilters[e.target.dataset.filter]=e.target.value; if(!e.target.value) delete activeFilters[e.target.dataset.filter]; render();
    }));
  }
  function filteredRecipes() {
    const query = normalize($("searchInput").value);
    let found = recipes.filter(r=>{
      const searchable = [r.name,r.url,...categories.flatMap(([k])=>r[k]),r.ingredients,r.instructions].join(" ").toLowerCase();
      return (!query || searchable.includes(query)) && categories.every(([key])=>!activeFilters[key] || r[key].some(v=>normalize(v)===normalize(activeFilters[key])));
    });
    found.sort((a,b)=>$("sortSelect").value==="za" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
    return found;
  }
  function photoMarkup(recipe){
    const manual = safeUrl(recipe.photo_url);
    const key = normalize(recipe.url);
    const cached = key && imageCache[key];
    const automatic = !manual && cached?.url ? cached.url : "";
    const chosen = manual || automatic;
    const source = chosen ? `<img class="recipe-photo-img" src="${escapeHtml(chosen)}" alt="Photo of ${escapeHtml(recipe.name)}" loading="lazy" referrerpolicy="no-referrer">` : "";
    // Keep the photo area empty when neither a manual image nor a recipe-page image is available.
    return `<div class="recipe-photo ${source?"has-photo":""}" data-photo-key="${escapeHtml(key)}" data-recipe-url="${escapeHtml(recipe.url)}" data-manual-photo="${manual?"1":"0"}">${source}</div>`;
  }

  function render() {
    const found = filteredRecipes(), grid = $("recipeGrid");
    grid.classList.toggle("list-view",view==="list");
    $("resultCount").textContent=`${found.length} ${found.length===1?"recipe":"recipes"}`;
    $("showingText").textContent=found.length===recipes.length?"Showing all recipes":`Showing ${found.length} of ${recipes.length} recipes`;
    $("activeFilterCount").textContent=Object.keys(activeFilters).length;
    grid.innerHTML=found.map(r=>{
      const meta = categories.flatMap(([key])=>r[key].map(value=>({key,value})));
      return `<article class="recipe-card" data-id="${escapeHtml(r.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(r.name)}">
        ${photoMarkup(r)}<div class="recipe-card-content"><div><div class="card-top"><span class="eyebrow">${escapeHtml(r.course[0] || "FAMILY RECIPE")}</span><span class="card-arrow">↗</span></div>
        <h3>${escapeHtml(r.name)}</h3></div><div class="card-meta">${meta.map(({key,value})=>`<span class="tag ${key === "favorites" ? "tag-favorite" : ""}">${escapeHtml(displayTag(key,value))}</span>`).join("")}</div></div></article>`;
    }).join("");
    grid.querySelectorAll(".recipe-card").forEach(card=>{
      const open=()=>showRecipe(recipes.find(r=>String(r.id)===card.dataset.id));
      card.addEventListener("click",open); card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
    });
    grid.querySelectorAll(".recipe-photo[data-recipe-url]").forEach(el=>observePhoto(el));
    grid.querySelectorAll(".recipe-photo-img").forEach(img=>img.addEventListener("error",()=>{img.remove();img.closest(".recipe-photo")?.classList.remove("has-photo")},{once:true}));
    $("emptyState").classList.toggle("hidden",found.length>0);
  }

  // Best-effort automatic photo lookup from the exact recipe page's Open Graph image.
  // No generic/stock-photo fallback is used. Manually entered photo links take priority.
  // If the recipe page has no usable image, the card's photo area stays blank.
  const photoObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){photoObserver.unobserve(entry.target);queuePhoto(entry.target);}
  }),{rootMargin:"240px"}) : null;
  function observePhoto(el){
    if(el.dataset.manualPhoto==="1") return;
    const key=el.dataset.photoKey, url=el.dataset.recipeUrl;
    if(!key||!url)return;
    const cached=imageCache[key];
    if(cached?.url){applyPhoto(el,cached.url);return;}
    if(cached?.retryAfter>Date.now())return;
    if(photoObserver)photoObserver.observe(el); else queuePhoto(el);
  }
  function applyPhoto(el,url){
    if(!el.isConnected || el.dataset.manualPhoto==="1")return;
    const img=document.createElement("img"); img.className="recipe-photo-img"; img.alt="Recipe photo"; img.loading="lazy"; img.referrerPolicy="no-referrer"; img.src=url;
    img.addEventListener("error",()=>{img.remove();el.classList.remove("has-photo")},{once:true});
    el.appendChild(img); el.classList.add("has-photo");
  }
  function queuePhoto(el){
    if(el.dataset.photoQueued)return;
    el.dataset.photoQueued="1"; imageQueue.push(el); runImageQueue();
  }
  function runImageQueue(){
    while(imageWorkers<2 && imageQueue.length){
      const el=imageQueue.shift(); if(!el?.isConnected)continue;
      imageWorkers++;
      fetchPhoto(el).finally(()=>{imageWorkers--;runImageQueue()});
    }
  }
  async function fetchPhoto(el){
    const key=el.dataset.photoKey, pageUrl=el.dataset.recipeUrl;
    if(!key||imageCache[key]?.url || el.dataset.manualPhoto==="1")return;
    try{
      const endpoint=`https://api.microlink.io/?url=${encodeURIComponent(pageUrl)}&filter=image.url`;
      const response=await fetch(endpoint);
      if(!response.ok)throw new Error(`Image lookup returned ${response.status}`);
      const result=await response.json();
      const imageUrl=result?.data?.image?.url;
      if(imageUrl && /^https?:\/\//i.test(imageUrl)){
        imageCache[key]={url:imageUrl}; saveImageCache(); applyPhoto(el,imageUrl);
      } else {imageCache[key]={url:"",retryAfter:Date.now()+7*24*60*60*1000};saveImageCache();}
    }catch(error){
      imageCache[key]={url:"",retryAfter:Date.now()+24*60*60*1000};saveImageCache();
    }
  }
  function showRecipe(recipe) {
    if(!recipe)return; currentRecipe=recipe;
    const all = categories.flatMap(([key])=>recipe[key].map(v=>`<span class="tag ${key === "favorites" ? "tag-favorite" : ""}">${escapeHtml(displayTag(key,v))}</span>`)).join("");
    const url = safeUrl(recipe.url);
    $("recipeModalContent").innerHTML=`<span class="modal-kicker">FROM THE FAMILY RECIPE BOX</span>
      <h2 class="modal-title" id="modalTitle">${escapeHtml(recipe.name)}</h2>
      <div class="modal-tags">${all || '<span class="tag">Family favorite</span>'}</div>
      ${recipe.ingredients?`<section class="detail-section"><h4>Ingredients</h4><p>${escapeHtml(recipe.ingredients)}</p></section>`:""}
      ${recipe.instructions?`<section class="detail-section"><h4>Instructions</h4><p>${escapeHtml(recipe.instructions)}</p></section>`:""}
      ${url?`<section class="detail-section"><h4>Original recipe</h4><a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open original recipe ↗</a></section>`:""}
      <div class="modal-actions"><button class="button button-dark" id="editCurrent">✎ Edit recipe</button><button class="button button-outline" id="deleteCurrent">Delete</button></div>`;
    $("recipeModal").classList.remove("hidden");
    $("editCurrent").addEventListener("click",()=>openEditor(recipe));
    $("deleteCurrent").addEventListener("click",()=>deleteRecipe(recipe));
  }
  function safeUrl(value) { try { const u=new URL(value); return ["http:","https:"].includes(u.protocol)?u.href:""; } catch { return ""; } }
  function closeModal(){$("recipeModal").classList.add("hidden");currentRecipe=null;}
  function tagPickerMarkup(key,label,selected){
    const options=[...new Set([...allTags(key),...selected])].sort((a,b)=>a.localeCompare(b));
    const items=options.map(tag=>`<button type="button" class="tag-choice ${selected.includes(tag)?"selected":""}" data-tag-value="${escapeHtml(tag)}" aria-pressed="${selected.includes(tag)}">${escapeHtml(displayTag(key,tag))}</button>`).join("");
    return `<div class="form-field tag-field"><label>${label}</label><details class="tag-picker" data-tag-picker="${key}"><summary><span class="tag-picker-summary">${selected.length?selected.map(v=>escapeHtml(displayTag(key,v))).join(", "):`Select ${escapeHtml(label.toLowerCase())}…`}</span><span class="tag-picker-chevron" aria-hidden="true">⌄</span></summary><div class="tag-picker-menu"><div class="tag-options">${items||'<span class="tag-empty">No options yet. Add a tag below.</span>'}</div><div class="tag-add-row"><input type="text" placeholder="Add a new tag" aria-label="Add a new ${escapeHtml(label.toLowerCase())} tag"><button type="button" class="button button-outline" data-add-tag="${key}">Add</button></div></div></details></div>`;
  }
  function refreshTagSummary(details){
    const selected=[...details.querySelectorAll('.tag-choice.selected')].map(b=>b.dataset.tagValue);
    const label=details.querySelector(".tag-picker-summary"); const fieldLabel=details.previousElementSibling?.textContent?.trim().toLowerCase() || "tags"; label.textContent=selected.length?selected.map(v=>displayTag(details.dataset.tagPicker,v)).join(", "):`Select ${fieldLabel}…`;
  }
  function openEditor(recipe=null) {
    currentRecipe=recipe;
    const selected=key=>Array.isArray(recipe?.[key])?recipe[key]:[];
    const nameAndLink=`<div class="form-field"><label for="field-name">Recipe name *</label><input id="field-name" name="name" type="text" value="${escapeHtml(recipe?.name||"")}" required></div>
      <div class="form-field"><label for="field-url">Recipe link</label><input id="field-url" name="url" type="url" value="${escapeHtml(recipe?.url||"")}" placeholder="https://…"></div>
      <div class="form-field full"><label for="field-photo">Photo link</label><input id="field-photo" name="photo_url" type="url" value="${escapeHtml(recipe?.photo_url||"")}" placeholder="Paste a direct image URL (ending in .jpg, .png, etc.)"><span class="form-help">Use a direct link to the image, not the recipe webpage.</span></div>`;
    const pickers=categories.map(([key,label])=>tagPickerMarkup(key,label,selected(key))).join("");
    $("recipeModalContent").innerHTML=`<span class="modal-kicker">${recipe?"UPDATE A FAMILY FAVORITE":"ADD TO THE COLLECTION"}</span>
      <h2 class="modal-title" id="modalTitle">${recipe?"Edit recipe":"Add a recipe"}</h2>
      <div class="connection-note">${hasSupabase?"Changes are shared with everyone who visits this recipe box.":"Preview mode: changes are saved only in this browser until Supabase is connected."}</div>
      <form id="recipeForm"><div class="form-grid">${nameAndLink}${pickers}</div>
      <div class="form-actions"><button type="button" class="button button-outline" id="cancelEdit">Cancel</button><button class="button button-dark" type="submit">${recipe?"Save changes":"Add recipe"}</button></div></form>`;
    $("recipeModal").classList.remove("hidden");
    $("cancelEdit").addEventListener("click",()=>recipe?showRecipe(recipe):closeModal());
    $("recipeModalContent").querySelectorAll(".tag-picker").forEach(details=>{
      details.addEventListener("click",e=>{
        const choice=e.target.closest(".tag-choice");
        if(choice){choice.classList.toggle("selected");choice.setAttribute("aria-pressed",choice.classList.contains("selected")?"true":"false");refreshTagSummary(details);}
      });
      details.querySelector("[data-add-tag]").addEventListener("click",()=>{
        const input=details.querySelector(".tag-add-row input"), value=input.value.trim(); if(!value)return;
        let choice=[...details.querySelectorAll(".tag-choice")].find(x=>normalize(x.dataset.tagValue)===normalize(value));
        if(!choice){choice=document.createElement("button");choice.type="button";choice.className="tag-choice";choice.dataset.tagValue=value;choice.textContent=displayTag(details.dataset.tagPicker,value);choice.setAttribute("aria-pressed","false");details.querySelector(".tag-options").appendChild(choice);}
        choice.classList.add("selected");choice.setAttribute("aria-pressed","true");input.value="";refreshTagSummary(details);
      });
    });
    $("recipeForm").addEventListener("submit",saveRecipe);
  }
  async function saveRecipe(event) {
    event.preventDefault(); const form=event.currentTarget, formData=new FormData(form), payload={};
    payload.name=String(formData.get("name")||"").trim();
    if(!payload.name){notify("Please add a recipe name.");return;}
    payload.url=String(formData.get("url")||"").trim();
    payload.photo_url=String(formData.get("photo_url")||"").trim();
    if(payload.url && !safeUrl(payload.url)){notify("Please enter a valid http or https link.");return;}
    if(payload.photo_url && !safeUrl(payload.photo_url)){notify("Please enter a valid http or https photo link.");return;}
    for(const [key] of categories) payload[key]=[...form.querySelectorAll(`.tag-picker[data-tag-picker="${key}"] .tag-choice.selected`)].map(button=>button.dataset.tagValue);
    try {
      if(db) {
        const result=currentRecipe?.id
          ? await db.from("recipes").update(payload).eq("id",currentRecipe.id).select().single()
          : await db.from("recipes").insert(payload).select().single();
        if(result.error)throw result.error;
        const saved=toRecipe(result.data);
        if(currentRecipe?.id) recipes=recipes.map(r=>r.id===saved.id?saved:r); else recipes.push(saved);
        notify(currentRecipe?.id?"Recipe updated for everyone!":"Recipe added for everyone!");
      } else {
        const saved=toRecipe({...payload,id:currentRecipe?.id || `local-${Date.now()}`});
        if(currentRecipe?.id) recipes=recipes.map(r=>r.id===currentRecipe.id?saved:r); else recipes.push(saved);
        localStorage.setItem("moms-recipe-box-local",JSON.stringify(recipes));
        notify("Saved in this browser preview.");
      }
      closeModal();renderFilters();render();
    } catch(error) {console.error(error);notify(`Couldn't save recipe: ${error.message||"check database setup"}`);}
  }
  async function deleteRecipe(recipe) {
    if(!confirm(`Delete "${recipe.name}" from the recipe box? This affects everyone.`))return;
    try {
      if(db){const {error}=await db.from("recipes").delete().eq("id",recipe.id);if(error)throw error;}
      recipes=recipes.filter(r=>r.id!==recipe.id);
      if(!db)localStorage.setItem("moms-recipe-box-local",JSON.stringify(recipes));
      closeModal();renderFilters();render();notify(db?"Recipe deleted for everyone.":"Recipe deleted from this browser.");
    } catch(error){notify(`Couldn't delete recipe: ${error.message||"database error"}`);}
  }
  function pickRandom() {
    const eligible=filteredRecipes(); if(!eligible.length){notify("No recipes match those filters.");return;}
    const pick=eligible[Math.floor(Math.random()*eligible.length)]; showRecipe(pick); notify(`Tonight's pick: ${pick.name}`);
  }
  async function loadRecipes() {
    if(db) {const {data,error}=await db.from("recipes").select("*").order("name");if(error)throw error;return data.map(toRecipe);}
    const local=localStorage.getItem("moms-recipe-box-local");
    if(local){try{return JSON.parse(local).map(toRecipe)}catch{}}
    const response=await fetch("data/recipes.json");if(!response.ok)throw new Error("Could not load the starter recipe data.");
    return (await response.json()).map((r,i)=>toRecipe({...r,id:`starter-${i+1}`}));
  }
  function bind() {
    $("searchInput").addEventListener("input",render); $("sortSelect").addEventListener("change",render);
    $("toggleFilters").addEventListener("click",()=>$ ("filterPanel").classList.toggle("open"));
    $("clearFilters").addEventListener("click",()=>{activeFilters={};renderFilters();render();});
    $("emptyClear").addEventListener("click",()=>{activeFilters={};$("searchInput").value="";renderFilters();render();});
    $("addRecipe").addEventListener("click",()=>openEditor()); $("randomButton").addEventListener("click",pickRandom); $("randomTop").addEventListener("click",pickRandom);
    $("closeModal").addEventListener("click",closeModal);
    $("recipeModal").addEventListener("click",e=>{if(e.target===$("recipeModal"))closeModal();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
    document.querySelectorAll(".view-button").forEach(b=>b.addEventListener("click",()=>{view=b.dataset.view;document.querySelectorAll(".view-button").forEach(x=>x.classList.toggle("selected",x===b));render();}));
  }
  async function init() {
    bind();
    try {recipes=await loadRecipes();renderFilters();render();}
    catch(error){console.error(error);$("recipeGrid").innerHTML=`<div class="connection-note">Unable to load recipes. ${escapeHtml(error.message)}</div>`;}
    if(!hasSupabase)notify("Preview mode: connect Supabase to share edits.");
  }
  init();
})();
