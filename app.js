/* Mom's Recipe Box — GitHub Pages front end + optional Supabase shared database */
(() => {
  const CONFIG = window.RECIPE_APP_CONFIG || {};
  const hasSupabase = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
  const db = hasSupabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
  const categories = [
    ["cook_method","Cook method"],["effort","Effort"],["favorites","Favorite person"],
    ["course","Course"],["collection","Collection"],["cuisine","Cuisine"]
  ];
  const IMAGE_CACHE_KEY = "moms-recipe-box-image-cache-v1";
  let recipes = [], activeFilters = {}, view = "grid", currentRecipe = null, toastTimer;
  let imageCache = readImageCache();
  const imageQueue = [];
  let imageWorkers = 0;
  const $ = id => document.getElementById(id);
  const escapeHtml = (value="") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalize = value => String(value || "").trim().toLowerCase();
  const tags = value => Array.isArray(value) ? value : (value ? String(value).split(",").map(x=>x.trim()).filter(Boolean) : []);
  const toRecipe = row => ({
    id: row.id ?? null, name: row.name || "", url: row.url || "",
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
      const options = allTags(key).map(v=>`<option value="${escapeHtml(v)}" ${activeFilters[key]===v?"selected":""}>${escapeHtml(v)}</option>`).join("");
      return `<div class="filter-group"><label for="filter-${key}">${label}</label><select id="filter-${key}" data-filter="${key}"><option value="">All ${label.toLowerCase()}s</option>${options}</select></div>`;
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
    const key=normalize(recipe.url);
    const cached=key && imageCache[key];
    const source=cached && cached.url ? `<img class="recipe-photo-img" src="${escapeHtml(cached.url)}" alt="Photo of ${escapeHtml(recipe.name)}" loading="lazy" referrerpolicy="no-referrer">` : "";
    const pending=key && (!cached || (!cached.url && cached.retryAfter && cached.retryAfter<Date.now()));
    return `<div class="recipe-photo ${source?"has-photo":""}" data-photo-key="${escapeHtml(key)}" data-recipe-url="${escapeHtml(recipe.url)}"><div class="recipe-photo-placeholder" aria-hidden="true"><span>✿</span></div>${source}</div>`;
  }
  function render() {
    const found = filteredRecipes(), grid = $("recipeGrid");
    grid.classList.toggle("list-view",view==="list");
    $("recipeCount").textContent=recipes.length;
    $("resultCount").textContent=`${found.length} ${found.length===1?"recipe":"recipes"}`;
    $("showingText").textContent=found.length===recipes.length?"Showing all recipes":`Showing ${found.length} of ${recipes.length} recipes`;
    $("activeFilterCount").textContent=Object.keys(activeFilters).length;
    grid.innerHTML=found.map(r=>{
      const meta = categories.flatMap(([key])=>r[key]).slice(0,4);
      return `<article class="recipe-card" data-id="${escapeHtml(r.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(r.name)}">
        ${photoMarkup(r)}<div class="recipe-card-content"><div><div class="card-top"><span class="eyebrow">${escapeHtml(r.course[0] || "FAMILY RECIPE")}</span><span class="card-arrow">↗</span></div>
        <h3>${escapeHtml(r.name)}</h3></div><div class="card-meta">${meta.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div></div></article>`;
    }).join("");
    grid.querySelectorAll(".recipe-card").forEach(card=>{
      const open=()=>showRecipe(recipes.find(r=>String(r.id)===card.dataset.id));
      card.addEventListener("click",open); card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
    });
    grid.querySelectorAll(".recipe-photo[data-recipe-url]").forEach(el=>observePhoto(el));
    grid.querySelectorAll(".recipe-photo-img").forEach(img=>img.addEventListener("error",()=>{img.remove();img.closest(".recipe-photo")?.classList.remove("has-photo")}));
    $("emptyState").classList.toggle("hidden",found.length>0);
  }
  // Pulls the recipe page's Open Graph/preview image. Results are cached locally to limit repeat lookups.
  const photoObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){photoObserver.unobserve(entry.target);queuePhoto(entry.target);}
  }),{rootMargin:"220px"}) : null;
  function observePhoto(el){
    const url=el.dataset.recipeUrl, key=el.dataset.photoKey;
    if(!url || !key)return;
    const cached=imageCache[key];
    if(cached?.url){applyPhoto(el,cached.url);return;}
    if(cached?.retryAfter>Date.now())return;
    if(photoObserver)photoObserver.observe(el); else queuePhoto(el);
  }
  function applyPhoto(el,url){
    if(!el.isConnected)return;
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
    if(!key||imageCache[key]?.url)return;
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
      // The free metadata service has a daily request limit; retry later rather than repeatedly calling it.
      imageCache[key]={url:"",retryAfter:Date.now()+24*60*60*1000};saveImageCache();
    }
  }
  function showRecipe(recipe) {
    if(!recipe)return; currentRecipe=recipe;
    const all = categories.flatMap(([key])=>recipe[key].map(v=>`<span class="tag">${escapeHtml(v)}</span>`)).join("");
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
    const checks=options.map(tag=>`<label class="tag-option"><input type="checkbox" name="${key}" value="${escapeHtml(tag)}" ${selected.includes(tag)?"checked":""}><span>${escapeHtml(tag)}</span></label>`).join("");
    return `<div class="form-field tag-field"><label>${label}</label><details class="tag-picker" data-tag-picker="${key}"><summary><span class="tag-picker-summary">${selected.length?`${selected.length} selected`:"Choose tags"}</span><span aria-hidden="true">⌄</span></summary><div class="tag-picker-menu"><div class="tag-options">${checks||'<span class="tag-empty">No tags yet. Add one below.</span>'}</div><div class="tag-add-row"><input type="text" placeholder="Add a new tag" aria-label="Add a new ${label.toLowerCase()} tag"><button type="button" class="button button-outline" data-add-tag="${key}">Add</button></div></div></details></div>`;
  }
  function refreshTagSummary(details){
    const count=details.querySelectorAll('input[type="checkbox"]:checked').length;
    details.querySelector(".tag-picker-summary").textContent=count?`${count} selected`:"Choose tags";
  }
  function openEditor(recipe=null) {
    currentRecipe=recipe;
    const selected=key=>Array.isArray(recipe?.[key])?recipe[key]:[];
    const nameAndLink=`<div class="form-field"><label for="field-name">Recipe name *</label><input id="field-name" name="name" type="text" value="${escapeHtml(recipe?.name||"")}" required></div>
      <div class="form-field"><label for="field-url">Recipe link</label><input id="field-url" name="url" type="url" value="${escapeHtml(recipe?.url||"")}" placeholder="https://…"></div>`;
    const pickers=categories.map(([key,label])=>tagPickerMarkup(key,label,selected(key))).join("");
    $("recipeModalContent").innerHTML=`<span class="modal-kicker">${recipe?"UPDATE A FAMILY FAVORITE":"ADD TO THE COLLECTION"}</span>
      <h2 class="modal-title" id="modalTitle">${recipe?"Edit recipe":"Add a recipe"}</h2>
      <div class="connection-note">${hasSupabase?"Changes are shared with everyone who visits this recipe box.":"Preview mode: changes are saved only in this browser until Supabase is connected."}</div>
      <form id="recipeForm"><div class="form-grid">${nameAndLink}${pickers}</div>
      <div class="form-actions"><button type="button" class="button button-outline" id="cancelEdit">Cancel</button><button class="button button-dark" type="submit">${recipe?"Save changes":"Add recipe"}</button></div></form>`;
    $("recipeModal").classList.remove("hidden");
    $("cancelEdit").addEventListener("click",()=>recipe?showRecipe(recipe):closeModal());
    $("recipeModalContent").querySelectorAll(".tag-picker").forEach(details=>{
      details.addEventListener("change",()=>refreshTagSummary(details));
      details.querySelector("[data-add-tag]").addEventListener("click",()=>{
        const input=details.querySelector(".tag-add-row input"), value=input.value.trim(); if(!value)return;
        let checkbox=[...details.querySelectorAll('input[type="checkbox"]')].find(x=>normalize(x.value)===normalize(value));
        if(!checkbox){const label=document.createElement("label");label.className="tag-option";label.innerHTML=`<input type="checkbox" name="${details.dataset.tagPicker}"><span></span>`;checkbox=label.querySelector("input");checkbox.value=value;label.querySelector("span").textContent=value;details.querySelector(".tag-options").appendChild(label);}
        checkbox.checked=true;input.value="";refreshTagSummary(details);
      });
    });
    $("recipeForm").addEventListener("submit",saveRecipe);
  }
  async function saveRecipe(event) {
    event.preventDefault(); const form=event.currentTarget, formData=new FormData(form), payload={};
    payload.name=String(formData.get("name")||"").trim();
    if(!payload.name){notify("Please add a recipe name.");return;}
    payload.url=String(formData.get("url")||"").trim();
    if(payload.url && !safeUrl(payload.url)){notify("Please enter a valid http or https link.");return;}
    for(const [key] of categories) payload[key]=[...form.querySelectorAll(`input[type="checkbox"][name="${key}"]:checked`)].map(input=>input.value);
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
