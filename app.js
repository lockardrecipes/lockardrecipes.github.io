/* Mom's Recipe Box — static GitHub Pages front end + optional Supabase shared database */
(() => {
  const CONFIG = window.RECIPE_APP_CONFIG || {};
  const hasSupabase = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
  const db = hasSupabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
  const categories = [
    ["cook_method","Cook method"],["effort","Effort"],["favorites","Favorite person"],
    ["course","Course"],["collection","Collection"],["cuisine","Cuisine"]
  ];
  let recipes = [], activeFilters = {}, view = "grid", currentRecipe = null, toastTimer;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value="") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalize = value => String(value || "").trim().toLowerCase();
  const tags = (value) => Array.isArray(value) ? value : (value ? String(value).split(",").map(x=>x.trim()).filter(Boolean) : []);
  const toRecipe = row => ({
    id: row.id ?? null, name: row.name || "", url: row.url || "",
    cook_method: tags(row.cook_method), effort: tags(row.effort), favorites: tags(row.favorites),
    course: tags(row.course), collection: tags(row.collection), cuisine: tags(row.cuisine),
    ingredients: row.ingredients || "", instructions: row.instructions || ""
  });
  function notify(message) {
    const toast = $("toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>toast.classList.remove("show"), 2600);
  }
  function allTags(key) {
    return [...new Set(recipes.flatMap(r=>r[key] || []))].sort((a,b)=>a.localeCompare(b));
  }
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
        <div><div class="card-top"><span class="eyebrow">${escapeHtml(r.course[0] || "FAMILY RECIPE")}</span><span class="card-arrow">↗</span></div>
        <h3>${escapeHtml(r.name)}</h3></div><div class="card-meta">${meta.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div></article>`;
    }).join("");
    grid.querySelectorAll(".recipe-card").forEach(card=>{
      const open=()=>showRecipe(recipes.find(r=>String(r.id)===card.dataset.id));
      card.addEventListener("click",open); card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
    });
    $("emptyState").classList.toggle("hidden",found.length>0);
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
  function closeModal() {$("recipeModal").classList.add("hidden");currentRecipe=null;}
  function openEditor(recipe=null) {
    currentRecipe=recipe;
    const fields = [
      ["name","Recipe name","text",true],["url","Recipe link","url",false],
      ["cook_method","Cook method tags","text",false],["effort","Effort tags","text",false],
      ["favorites","Favorite person tags","text",false],["course","Course tags","text",false],
      ["collection","Collection tags","text",false],["cuisine","Cuisine tags","text",false],
      ["ingredients","Ingredients (optional)","textarea",false],["instructions","Instructions (optional)","textarea",false]
    ];
    const value = key => Array.isArray(recipe?.[key])?recipe[key].join(", "):(recipe?.[key]||"");
    $("recipeModalContent").innerHTML=`<span class="modal-kicker">${recipe?"UPDATE A FAMILY FAVORITE":"ADD TO THE COLLECTION"}</span>
      <h2 class="modal-title" id="modalTitle">${recipe?"Edit recipe":"Add a recipe"}</h2>
      <div class="connection-note">${hasSupabase?"Changes are shared with everyone who visits this recipe box.":"Preview mode: changes are saved only in this browser until Supabase is connected."}</div>
      <form id="recipeForm"><div class="form-grid">${fields.map(([key,label,type,required])=>`<div class="form-field ${["ingredients","instructions"].includes(key)?"full":""}"><label for="field-${key}">${label}${required?" *":""}</label>${type==="textarea"?`<textarea id="field-${key}" name="${key}">${escapeHtml(value(key))}</textarea>`:`<input id="field-${key}" name="${key}" type="${type}" value="${escapeHtml(value(key))}" ${required?"required":""} ${key==="url"?'placeholder="https://…"':""}>`}${categories.some(([k])=>k===key)?'<span class="form-help">Separate multiple tags with commas.</span>':""}</div>`).join("")}</div>
      <div class="form-actions"><button type="button" class="button button-outline" id="cancelEdit">Cancel</button><button class="button button-dark" type="submit">${recipe?"Save changes":"Add recipe"}</button></div></form>`;
    $("recipeModal").classList.remove("hidden");
    $("cancelEdit").addEventListener("click",()=>recipe?showRecipe(recipe):closeModal());
    $("recipeForm").addEventListener("submit",saveRecipe);
  }
  async function saveRecipe(event) {
    event.preventDefault(); const form=new FormData(event.currentTarget), payload={};
    payload.name=String(form.get("name")||"").trim();
    if(!payload.name){notify("Please add a recipe name.");return;}
    payload.url=String(form.get("url")||"").trim();
    if(payload.url && !safeUrl(payload.url)){notify("Please enter a valid http or https link.");return;}
    for(const [key] of categories) payload[key]=String(form.get(key)||"").split(",").map(x=>x.trim()).filter(Boolean);
    payload.ingredients=String(form.get("ingredients")||"").trim();
    payload.instructions=String(form.get("instructions")||"").trim();
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
    const eligible=filteredRecipes();
    if(!eligible.length){notify("No recipes match those filters.");return;}
    const pick=eligible[Math.floor(Math.random()*eligible.length)];
    showRecipe(pick);
    notify(`Tonight's pick: ${pick.name}`);
  }
  async function loadRecipes() {
    if(db) {
      const {data,error}=await db.from("recipes").select("*").order("name");
      if(error)throw error; return data.map(toRecipe);
    }
    const local=localStorage.getItem("moms-recipe-box-local");
    if(local){try{return JSON.parse(local).map(toRecipe)}catch{}}
    const response=await fetch("data/recipes.json"); if(!response.ok)throw new Error("Could not load the starter recipe data.");
    return (await response.json()).map((r,i)=>toRecipe({...r,id:`starter-${i+1}`}));
  }
  function bind() {
    $("searchInput").addEventListener("input",render);
    $("sortSelect").addEventListener("change",render);
    $("toggleFilters").addEventListener("click",()=>$("filterPanel").classList.toggle("open"));
    $("clearFilters").addEventListener("click",()=>{activeFilters={};renderFilters();render();});
    $("emptyClear").addEventListener("click",()=>{activeFilters={};$("searchInput").value="";renderFilters();render();});
    $("addRecipe").addEventListener("click",()=>openEditor());
    $("randomButton").addEventListener("click",pickRandom); $("randomTop").addEventListener("click",pickRandom);
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